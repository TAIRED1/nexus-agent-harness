/**
 * @file types/index.ts
 * @description Core domain types for the Nexus MCP Server.
 *
 * All types are fully branded and discriminated to prevent
 * accidental cross-domain value misuse in strict TypeScript.
 */
declare const __brand: unique symbol;
type Brand<T, B extends string> = T & {
    [__brand]: B;
};
export type SessionId = Brand<string, "SessionId">;
export type ToolCallId = Brand<string, "ToolCallId">;
export type AgentId = Brand<string, "AgentId">;
export type ShellSessionId = Brand<string, "ShellSessionId">;
export type Timestamp = Brand<number, "Timestamp">;
export interface AgentSession {
    sessionId: SessionId;
    agentId: AgentId;
    createdAt: Timestamp;
    lastActivity: Timestamp;
    metadata: Record<string, unknown>;
}
export type ToolCallStatus = "pending" | "running" | "success" | "error" | "timeout";
export interface ToolCallRecord {
    id: ToolCallId;
    sessionId: SessionId;
    toolName: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    startedAt: Timestamp;
    completedAt: Timestamp | null;
    durationMs: number | null;
    status: ToolCallStatus;
    errorMessage: string | null;
    inputSizeBytes: number;
    outputSizeBytes: number;
}
export interface TokenBurnWindow {
    windowStart: Timestamp;
    windowEnd: Timestamp;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    callCount: number;
    errorCount: number;
    averageDurationMs: number;
    peakDurationMs: number;
    tokensPerSecond: number;
    estimatedCostUSD: number;
}
export interface TokenBurnAnalytics {
    agentId: AgentId;
    sessionId: SessionId;
    lifetimeTotals: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        callCount: number;
        errorCount: number;
        estimatedCostUSD: number;
    };
    windows: {
        last1m: TokenBurnWindow;
        last5m: TokenBurnWindow;
        last1h: TokenBurnWindow;
    };
    topTools: Array<{
        toolName: string;
        callCount: number;
        totalTokens: number;
        averageDurationMs: number;
    }>;
}
export interface CpuMetrics {
    manufacturer: string;
    brand: string;
    speed: number;
    cores: number;
    physicalCores: number;
    currentLoad: number;
    userLoad: number;
    systemLoad: number;
    idleLoad: number;
    perCoreLoad: number[];
}
export interface MemoryMetrics {
    total: number;
    free: number;
    used: number;
    active: number;
    available: number;
    usagePercent: number;
    swapTotal: number;
    swapUsed: number;
    swapFree: number;
}
export interface DiskMetrics {
    fs: string;
    type: string;
    size: number;
    used: number;
    available: number;
    usePercent: number;
    mount: string;
}
export interface NetworkMetrics {
    iface: string;
    rxBytesPerSec: number;
    txBytesPerSec: number;
    rxDropSec: number;
    txDropSec: number;
}
export interface ProcessMetrics {
    pid: number;
    name: string;
    cpu: number;
    mem: number;
    command: string;
}
export interface SystemSnapshot {
    capturedAt: Timestamp;
    cpu: CpuMetrics;
    memory: MemoryMetrics;
    disks: DiskMetrics[];
    network: NetworkMetrics[];
    topProcesses: ProcessMetrics[];
    loadAverage: [number, number, number];
    uptime: number;
    platform: string;
    hostname: string;
    nodeVersion: string;
}
export type ShellSessionStatus = "idle" | "running" | "terminated" | "error";
export interface ShellSession {
    id: ShellSessionId;
    agentId: AgentId;
    sessionId: SessionId;
    createdAt: Timestamp;
    lastActivity: Timestamp;
    status: ShellSessionStatus;
    cwd: string;
    shell: string;
    commandHistory: ShellCommand[];
    totalCommands: number;
    environment: Record<string, string>;
}
export interface ShellCommand {
    id: string;
    command: string;
    startedAt: Timestamp;
    completedAt: Timestamp | null;
    exitCode: number | null;
    stdout: string;
    stderr: string;
    durationMs: number | null;
    timedOut: boolean;
    truncated: boolean;
}
export interface ShellExecutionResult {
    commandId: string;
    exitCode: number;
    stdout: string;
    stderr: string;
    durationMs: number;
    timedOut: boolean;
    truncated: boolean;
    sessionId: ShellSessionId;
}
export interface NexusTool {
    name: string;
    description: string;
    category: "system" | "analytics" | "shell" | "agent";
    version: string;
}
export type TelemetryEventType = "tool_call_started" | "tool_call_completed" | "tool_call_error" | "shell_command_executed" | "shell_session_created" | "shell_session_terminated" | "system_snapshot_captured" | "token_burn_threshold_exceeded" | "agent_connected" | "agent_disconnected";
export interface TelemetryEvent {
    id: string;
    type: TelemetryEventType;
    timestamp: Timestamp;
    sessionId: SessionId | null;
    agentId: AgentId | null;
    payload: Record<string, unknown>;
}
export interface NexusServerConfig {
    server: {
        port: number;
        host: string;
        transport: "stdio" | "http" | "sse";
    };
    security: {
        allowedShellCommands: string[] | null;
        blockedShellPatterns: string[];
        maxCommandTimeout: number;
        maxOutputBytes: number;
        rateLimitRequestsPerMinute: number;
    };
    telemetry: {
        wsPort: number;
        snapshotIntervalMs: number;
        retentionMs: number;
    };
    tokens: {
        estimatedInputCostPer1kUSD: number;
        estimatedOutputCostPer1kUSD: number;
        burnAlertThresholdPerHour: number;
    };
    shell: {
        defaultShell: string;
        maxSessions: number;
        sessionTimeoutMs: number;
        defaultCwd: string;
    };
}
export {};
//# sourceMappingURL=index.d.ts.map