"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ListShellSessionsInputSchema = exports.TerminateShellSessionInputSchema = exports.GetShellSessionInputSchema = exports.ExecuteCommandInputSchema = exports.CreateShellSessionInputSchema = void 0;
exports.createShellSession = createShellSession;
exports.executeCommand = executeCommand;
exports.getShellSession = getShellSession;
exports.terminateShellSession = terminateShellSession;
exports.listShellSessions = listShellSessions;
const node_child_process_1 = require("node:child_process");
const uuid_1 = require("uuid");
const zod_1 = require("zod");
const config_js_1 = require("../utils/config.js");
const telemetry_bus_js_1 = require("../utils/telemetry-bus.js");
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createLogger)("shell-executor");
// ─── Session Store ─────────────────────────────────────────────────────────
const shellSessions = new Map();
// ─── Input Schemas ─────────────────────────────────────────────────────────
exports.CreateShellSessionInputSchema = zod_1.z.object({
    sessionId: zod_1.z.string().min(1).describe("Parent agent session ID"),
    agentId: zod_1.z.string().min(1).describe("Agent identifier"),
    cwd: zod_1.z
        .string()
        .optional()
        .describe("Initial working directory. Defaults to server default CWD if omitted."),
    shell: zod_1.z
        .string()
        .optional()
        .describe("Shell binary path (e.g. /bin/bash). Defaults to server configured shell."),
    environment: zod_1.z
        .record(zod_1.z.string())
        .optional()
        .default({})
        .describe("Additional environment variables to inject into the session"),
});
exports.ExecuteCommandInputSchema = zod_1.z.object({
    shellSessionId: zod_1.z
        .string()
        .min(1)
        .describe("Shell session ID returned by create_shell_session"),
    command: zod_1.z
        .string()
        .min(1)
        .max(8192)
        .describe("Shell command to execute. Must be a single command string."),
    timeoutMs: zod_1.z
        .number()
        .int()
        .min(100)
        .optional()
        .describe("Command-specific timeout in milliseconds. Cannot exceed server maximum."),
    captureStderr: zod_1.z
        .boolean()
        .default(true)
        .describe("Whether to capture stderr in addition to stdout"),
});
exports.GetShellSessionInputSchema = zod_1.z.object({
    shellSessionId: zod_1.z.string().min(1).describe("Shell session ID to inspect"),
    includeHistory: zod_1.z
        .boolean()
        .default(true)
        .describe("Include command execution history"),
    historyLimit: zod_1.z
        .number()
        .int()
        .min(1)
        .max(200)
        .default(20)
        .describe("Maximum number of history entries to return"),
});
exports.TerminateShellSessionInputSchema = zod_1.z.object({
    shellSessionId: zod_1.z.string().min(1).describe("Shell session ID to terminate"),
});
exports.ListShellSessionsInputSchema = zod_1.z.object({
    agentId: zod_1.z
        .string()
        .min(1)
        .describe("Agent ID to list shell sessions for"),
    statusFilter: zod_1.z
        .enum(["idle", "running", "terminated", "error", "all"])
        .default("all")
        .describe("Filter sessions by status"),
});
// ─── Security Enforcement ──────────────────────────────────────────────────
function enforceSecurityPolicy(command) {
    // Check blocklist patterns
    for (const pattern of config_js_1.config.security.blockedShellPatterns) {
        if (command.includes(pattern)) {
            throw new Error(`[Security] Command blocked: matches prohibited pattern "${pattern}"`);
        }
    }
    // If allowlist is configured, verify command prefix matches
    if (config_js_1.config.security.allowedShellCommands !== null) {
        const commandBin = command.trim().split(/\s+/)[0];
        const allowed = config_js_1.config.security.allowedShellCommands.some((allowed) => commandBin === allowed || commandBin?.startsWith(allowed + " "));
        if (!allowed) {
            throw new Error(`[Security] Command blocked: "${commandBin}" is not in the allowed commands list`);
        }
    }
}
// ─── Execution Engine ──────────────────────────────────────────────────────
function executeCommandInShell(opts) {
    return new Promise((resolve, reject) => {
        const env = {
            ...process.env,
            ...opts.environment,
            TERM: "xterm-256color",
        };
        const proc = (0, node_child_process_1.spawn)(opts.shell, ["-c", opts.command], {
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
        proc.stdout.on("data", (chunk) => {
            const data = chunk.toString("utf8");
            stdout += data;
            if (Buffer.byteLength(stdout, "utf8") > opts.maxOutputBytes) {
                stdout = stdout.slice(0, opts.maxOutputBytes);
                truncated = true;
                proc.kill("SIGTERM");
            }
        });
        proc.stderr.on("data", (chunk) => {
            if (!opts.captureStderr)
                return;
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
function createShellSession(input) {
    const activeCount = [...shellSessions.values()].filter((s) => s.status !== "terminated" && s.status !== "error").length;
    if (activeCount >= config_js_1.config.shell.maxSessions) {
        throw new Error(`[ShellExecutor] Maximum concurrent shell sessions (${config_js_1.config.shell.maxSessions}) reached`);
    }
    const id = (0, uuid_1.v4)();
    const sessionId = input.sessionId;
    const agentId = input.agentId;
    const now = Date.now();
    const session = {
        id,
        agentId,
        sessionId,
        createdAt: now,
        lastActivity: now,
        status: "idle",
        cwd: input.cwd ?? config_js_1.config.shell.defaultCwd,
        shell: input.shell ?? config_js_1.config.shell.defaultShell,
        commandHistory: [],
        totalCommands: 0,
        environment: input.environment ?? {},
    };
    shellSessions.set(id, session);
    telemetry_bus_js_1.telemetryBus.publish("shell_session_created", {
        sessionId,
        agentId,
        data: { shellSessionId: id, shell: session.shell, cwd: session.cwd },
    });
    logger.info({ shellSessionId: id, agentId, cwd: session.cwd }, "Shell session created");
    return session;
}
async function executeCommand(input) {
    const shellSessionId = input.shellSessionId;
    const session = shellSessions.get(shellSessionId);
    if (!session) {
        throw new Error(`[ShellExecutor] Shell session not found: ${shellSessionId}`);
    }
    if (session.status === "terminated" || session.status === "error") {
        throw new Error(`[ShellExecutor] Shell session ${shellSessionId} is ${session.status} and cannot accept commands`);
    }
    // Security enforcement
    enforceSecurityPolicy(input.command);
    const effectiveTimeout = Math.min(input.timeoutMs ?? config_js_1.config.security.maxCommandTimeout, config_js_1.config.security.maxCommandTimeout);
    session.status = "running";
    const commandId = (0, uuid_1.v4)();
    const startedAt = Date.now();
    let result;
    try {
        result = await executeCommandInShell({
            command: input.command,
            cwd: session.cwd,
            shell: session.shell,
            environment: session.environment,
            timeoutMs: effectiveTimeout,
            maxOutputBytes: config_js_1.config.security.maxOutputBytes,
            captureStderr: input.captureStderr,
        });
    }
    catch (err) {
        session.status = "error";
        throw err;
    }
    const completedAt = Date.now();
    const durationMs = completedAt - startedAt;
    const shellCommand = {
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
    telemetry_bus_js_1.telemetryBus.publish("shell_command_executed", {
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
    logger.debug({
        shellSessionId,
        commandId,
        exitCode: result.exitCode,
        durationMs,
        timedOut: result.timedOut,
    }, "Command executed");
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
function getShellSession(input) {
    const shellSessionId = input.shellSessionId;
    const session = shellSessions.get(shellSessionId);
    if (!session) {
        throw new Error(`[ShellExecutor] Shell session not found: ${shellSessionId}`);
    }
    const historySlice = input.includeHistory
        ? session.commandHistory.slice(-input.historyLimit)
        : [];
    return { ...session, historySlice };
}
function terminateShellSession(input) {
    const shellSessionId = input.shellSessionId;
    const session = shellSessions.get(shellSessionId);
    if (!session) {
        throw new Error(`[ShellExecutor] Shell session not found: ${shellSessionId}`);
    }
    session.status = "terminated";
    session.lastActivity = Date.now();
    telemetry_bus_js_1.telemetryBus.publish("shell_session_terminated", {
        sessionId: session.sessionId,
        agentId: session.agentId,
        data: {
            shellSessionId,
            totalCommands: session.totalCommands,
        },
    });
    logger.info({ shellSessionId, totalCommands: session.totalCommands }, "Shell session terminated");
    return { terminated: true, totalCommands: session.totalCommands };
}
function listShellSessions(input) {
    const agentId = input.agentId;
    const sessions = [...shellSessions.values()].filter((s) => s.agentId === agentId);
    if (input.statusFilter === "all") {
        return sessions;
    }
    return sessions.filter((s) => s.status === input.statusFilter);
}
//# sourceMappingURL=shell-executor.js.map