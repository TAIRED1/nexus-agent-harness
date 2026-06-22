/**
 * @file tools/shell-executor.ts
 * @description Isolated shell execution environment for autonomous LLM agents.
 *
 * Provides persistent, per-session shell sessions with:
 *   - Command blocklist enforcement
 *   - Configurable timeouts and output size caps
 *   - Full command history tracking
 *   - Telemetry event emission on every execution
 *
 * Tools:
 *   - create_shell_session    : Initialize a new isolated shell session
 *   - execute_command         : Run a command in an existing session
 *   - get_shell_session       : Inspect session state and history
 *   - terminate_shell_session : Cleanly terminate a shell session
 *   - list_shell_sessions     : List all active sessions for an agent
 */

import { spawn } from "node:child_process";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import type {
  ShellSession,
  ShellCommand,
  ShellExecutionResult,
  ShellSessionId,
  SessionId,
  AgentId,
  Timestamp,
} from "../types/index.js";
import { config } from "../utils/config.js";
import { telemetryBus } from "../utils/telemetry-bus.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("shell-executor");

// ─── Session Store ─────────────────────────────────────────────────────────

const shellSessions = new Map<ShellSessionId, ShellSession>();

// ─── Input Schemas ─────────────────────────────────────────────────────────

export const CreateShellSessionInputSchema = z.object({
  sessionId: z.string().min(1).describe("Parent agent session ID"),
  agentId: z.string().min(1).describe("Agent identifier"),
  cwd: z
    .string()
    .optional()
    .describe(
      "Initial working directory. Defaults to server default CWD if omitted."
    ),
  shell: z
    .string()
    .optional()
    .describe(
      "Shell binary path (e.g. /bin/bash). Defaults to server configured shell."
    ),
  environment: z
    .record(z.string())
    .optional()
    .default({})
    .describe("Additional environment variables to inject into the session"),
});

export const ExecuteCommandInputSchema = z.object({
  shellSessionId: z
    .string()
    .min(1)
    .describe("Shell session ID returned by create_shell_session"),
  command: z
    .string()
    .min(1)
    .max(8192)
    .describe("Shell command to execute. Must be a single command string."),
  timeoutMs: z
    .number()
    .int()
    .min(100)
    .optional()
    .describe(
      "Command-specific timeout in milliseconds. Cannot exceed server maximum."
    ),
  captureStderr: z
    .boolean()
    .default(true)
    .describe("Whether to capture stderr in addition to stdout"),
});

export const GetShellSessionInputSchema = z.object({
  shellSessionId: z.string().min(1).describe("Shell session ID to inspect"),
  includeHistory: z
    .boolean()
    .default(true)
    .describe("Include command execution history"),
  historyLimit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .default(20)
    .describe("Maximum number of history entries to return"),
});

export const TerminateShellSessionInputSchema = z.object({
  shellSessionId: z.string().min(1).describe("Shell session ID to terminate"),
});

export const ListShellSessionsInputSchema = z.object({
  agentId: z
    .string()
    .min(1)
    .describe("Agent ID to list shell sessions for"),
  statusFilter: z
    .enum(["idle", "running", "terminated", "error", "all"])
    .default("all")
    .describe("Filter sessions by status"),
});

export type CreateShellSessionInput = z.infer<
  typeof CreateShellSessionInputSchema
>;
export type ExecuteCommandInput = z.infer<typeof ExecuteCommandInputSchema>;
export type GetShellSessionInput = z.infer<typeof GetShellSessionInputSchema>;
export type TerminateShellSessionInput = z.infer<
  typeof TerminateShellSessionInputSchema
>;
export type ListShellSessionsInput = z.infer<
  typeof ListShellSessionsInputSchema
>;

// ─── Security Enforcement ──────────────────────────────────────────────────

function enforceSecurityPolicy(command: string): void {
  // Check blocklist patterns
  for (const pattern of config.security.blockedShellPatterns) {
    if (command.includes(pattern)) {
      throw new Error(
        `[Security] Command blocked: matches prohibited pattern "${pattern}"`
      );
    }
  }

  // If allowlist is configured, verify command prefix matches
  if (config.security.allowedShellCommands !== null) {
    const commandBin = command.trim().split(/\s+/)[0];
    const allowed = config.security.allowedShellCommands.some(
      (allowed) => commandBin === allowed || commandBin?.startsWith(allowed + " ")
    );
    if (!allowed) {
      throw new Error(
        `[Security] Command blocked: "${commandBin}" is not in the allowed commands list`
      );
    }
  }
}

// ─── Execution Engine ──────────────────────────────────────────────────────

function executeCommandInShell(opts: {
  command: string;
  cwd: string;
  shell: string;
  environment: Record<string, string>;
  timeoutMs: number;
  maxOutputBytes: number;
  captureStderr: boolean;
}): Promise<{ exitCode: number; stdout: string; stderr: string; timedOut: boolean; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      ...opts.environment,
      TERM: "xterm-256color",
    } as Record<string, string>;

    const proc = spawn(opts.shell, ["-c", opts.command], {
      cwd: opts.cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let truncated = false;

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
      setTimeout(() => proc.kill("SIGKILL"), 1000);
    }, opts.timeoutMs);

    proc.stdout.on("data", (chunk: Buffer) => {
      const data = chunk.toString("utf8");
      stdout += data;
      if (Buffer.byteLength(stdout, "utf8") > opts.maxOutputBytes) {
        stdout = stdout.slice(0, opts.maxOutputBytes);
        truncated = true;
        proc.kill("SIGTERM");
      }
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      if (!opts.captureStderr) return;
      const data = chunk.toString("utf8");
      stderr += data;
      if (Buffer.byteLength(stderr, "utf8") > opts.maxOutputBytes) {
        stderr = stderr.slice(0, opts.maxOutputBytes);
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: code ?? -1,
        stdout,
        stderr,
        timedOut,
        truncated,
      });
    });
  });
}

// ─── Tool Implementations ──────────────────────────────────────────────────

export function createShellSession(
  input: CreateShellSessionInput
): ShellSession {
  const activeCount = [...shellSessions.values()].filter(
    (s) => s.status !== "terminated" && s.status !== "error"
  ).length;

  if (activeCount >= config.shell.maxSessions) {
    throw new Error(
      `[ShellExecutor] Maximum concurrent shell sessions (${config.shell.maxSessions}) reached`
    );
  }

  const id = uuidv4() as ShellSessionId;
  const sessionId = input.sessionId as SessionId;
  const agentId = input.agentId as AgentId;
  const now = Date.now() as Timestamp;

  const session: ShellSession = {
    id,
    agentId,
    sessionId,
    createdAt: now,
    lastActivity: now,
    status: "idle",
    cwd: input.cwd ?? config.shell.defaultCwd,
    shell: input.shell ?? config.shell.defaultShell,
    commandHistory: [],
    totalCommands: 0,
    environment: input.environment ?? {},
  };

  shellSessions.set(id, session);

  telemetryBus.publish("shell_session_created", {
    sessionId,
    agentId,
    data: { shellSessionId: id, shell: session.shell, cwd: session.cwd },
  });

  logger.info({ shellSessionId: id, agentId, cwd: session.cwd }, "Shell session created");

  return session;
}

export async function executeCommand(
  input: ExecuteCommandInput
): Promise<ShellExecutionResult> {
  const shellSessionId = input.shellSessionId as ShellSessionId;
  const session = shellSessions.get(shellSessionId);

  if (!session) {
    throw new Error(`[ShellExecutor] Shell session not found: ${shellSessionId}`);
  }

  if (session.status === "terminated" || session.status === "error") {
    throw new Error(
      `[ShellExecutor] Shell session ${shellSessionId} is ${session.status} and cannot accept commands`
    );
  }

  // Security enforcement
  enforceSecurityPolicy(input.command);

  const effectiveTimeout = Math.min(
    input.timeoutMs ?? config.security.maxCommandTimeout,
    config.security.maxCommandTimeout
  );

  session.status = "running";
  const commandId = uuidv4();
  const startedAt = Date.now() as Timestamp;

  let result: { exitCode: number; stdout: string; stderr: string; timedOut: boolean; truncated: boolean };

  try {
    result = await executeCommandInShell({
      command: input.command,
      cwd: session.cwd,
      shell: session.shell,
      environment: session.environment,
      timeoutMs: effectiveTimeout,
      maxOutputBytes: config.security.maxOutputBytes,
      captureStderr: input.captureStderr,
    });
  } catch (err) {
    session.status = "error";
    throw err;
  }

  const completedAt = Date.now() as Timestamp;
  const durationMs = completedAt - startedAt;

  const shellCommand: ShellCommand = {
    id: commandId,
    command: input.command,
    startedAt,
    completedAt,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs,
    timedOut: result.timedOut,
    truncated: result.truncated,
  };

  session.commandHistory.push(shellCommand);
  session.totalCommands++;
  session.lastActivity = completedAt;
  session.status = "idle";

  // Trim history to prevent unbounded growth
  if (session.commandHistory.length > 200) {
    session.commandHistory = session.commandHistory.slice(-200);
  }

  telemetryBus.publish("shell_command_executed", {
    sessionId: session.sessionId,
    agentId: session.agentId,
    data: {
      shellSessionId,
      commandId,
      command: input.command,
      exitCode: result.exitCode,
      durationMs,
      timedOut: result.timedOut,
    },
  });

  logger.debug(
    {
      shellSessionId,
      commandId,
      exitCode: result.exitCode,
      durationMs,
      timedOut: result.timedOut,
    },
    "Command executed"
  );

  return {
    commandId,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs,
    timedOut: result.timedOut,
    truncated: result.truncated,
    sessionId: shellSessionId,
  };
}

export function getShellSession(
  input: GetShellSessionInput
): ShellSession & { historySlice: ShellCommand[] } {
  const shellSessionId = input.shellSessionId as ShellSessionId;
  const session = shellSessions.get(shellSessionId);

  if (!session) {
    throw new Error(`[ShellExecutor] Shell session not found: ${shellSessionId}`);
  }

  const historySlice = input.includeHistory
    ? session.commandHistory.slice(-input.historyLimit)
    : [];

  return { ...session, historySlice };
}

export function terminateShellSession(
  input: TerminateShellSessionInput
): { terminated: boolean; totalCommands: number } {
  const shellSessionId = input.shellSessionId as ShellSessionId;
  const session = shellSessions.get(shellSessionId);

  if (!session) {
    throw new Error(`[ShellExecutor] Shell session not found: ${shellSessionId}`);
  }

  session.status = "terminated";
  session.lastActivity = Date.now() as Timestamp;

  telemetryBus.publish("shell_session_terminated", {
    sessionId: session.sessionId,
    agentId: session.agentId,
    data: {
      shellSessionId,
      totalCommands: session.totalCommands,
    },
  });

  logger.info(
    { shellSessionId, totalCommands: session.totalCommands },
    "Shell session terminated"
  );

  return { terminated: true, totalCommands: session.totalCommands };
}

export function listShellSessions(
  input: ListShellSessionsInput
): ShellSession[] {
  const agentId = input.agentId as AgentId;
  const sessions = [...shellSessions.values()].filter(
    (s) => s.agentId === agentId
  );

  if (input.statusFilter === "all") {
    return sessions;
  }

  return sessions.filter((s) => s.status === input.statusFilter);
}
