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
import { z } from "zod";
import type { ShellSession, ShellCommand, ShellExecutionResult } from "../types/index.js";
export declare const CreateShellSessionInputSchema: z.ZodObject<{
    sessionId: z.ZodString;
    agentId: z.ZodString;
    cwd: z.ZodOptional<z.ZodString>;
    shell: z.ZodOptional<z.ZodString>;
    environment: z.ZodDefault<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>>;
}, "strip", z.ZodTypeAny, {
    sessionId: string;
    agentId: string;
    environment: Record<string, string>;
    shell?: string | undefined;
    cwd?: string | undefined;
}, {
    sessionId: string;
    agentId: string;
    shell?: string | undefined;
    cwd?: string | undefined;
    environment?: Record<string, string> | undefined;
}>;
export declare const ExecuteCommandInputSchema: z.ZodObject<{
    shellSessionId: z.ZodString;
    command: z.ZodString;
    timeoutMs: z.ZodOptional<z.ZodNumber>;
    captureStderr: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    shellSessionId: string;
    command: string;
    captureStderr: boolean;
    timeoutMs?: number | undefined;
}, {
    shellSessionId: string;
    command: string;
    timeoutMs?: number | undefined;
    captureStderr?: boolean | undefined;
}>;
export declare const GetShellSessionInputSchema: z.ZodObject<{
    shellSessionId: z.ZodString;
    includeHistory: z.ZodDefault<z.ZodBoolean>;
    historyLimit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    shellSessionId: string;
    includeHistory: boolean;
    historyLimit: number;
}, {
    shellSessionId: string;
    includeHistory?: boolean | undefined;
    historyLimit?: number | undefined;
}>;
export declare const TerminateShellSessionInputSchema: z.ZodObject<{
    shellSessionId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    shellSessionId: string;
}, {
    shellSessionId: string;
}>;
export declare const ListShellSessionsInputSchema: z.ZodObject<{
    agentId: z.ZodString;
    statusFilter: z.ZodDefault<z.ZodEnum<["idle", "running", "terminated", "error", "all"]>>;
}, "strip", z.ZodTypeAny, {
    agentId: string;
    statusFilter: "running" | "error" | "idle" | "terminated" | "all";
}, {
    agentId: string;
    statusFilter?: "running" | "error" | "idle" | "terminated" | "all" | undefined;
}>;
export type CreateShellSessionInput = z.infer<typeof CreateShellSessionInputSchema>;
export type ExecuteCommandInput = z.infer<typeof ExecuteCommandInputSchema>;
export type GetShellSessionInput = z.infer<typeof GetShellSessionInputSchema>;
export type TerminateShellSessionInput = z.infer<typeof TerminateShellSessionInputSchema>;
export type ListShellSessionsInput = z.infer<typeof ListShellSessionsInputSchema>;
export declare function createShellSession(input: CreateShellSessionInput): ShellSession;
export declare function executeCommand(input: ExecuteCommandInput): Promise<ShellExecutionResult>;
export declare function getShellSession(input: GetShellSessionInput): ShellSession & {
    historySlice: ShellCommand[];
};
export declare function terminateShellSession(input: TerminateShellSessionInput): {
    terminated: boolean;
    totalCommands: number;
};
export declare function listShellSessions(input: ListShellSessionsInput): ShellSession[];
//# sourceMappingURL=shell-executor.d.ts.map