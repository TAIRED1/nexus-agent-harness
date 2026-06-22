/**
 * @file lib/types.ts
 * Dashboard shared TypeScript types — mirrors the MCP server domain types.
 */

export type TelemetryEventType =
  | "tool_call_started"
  | "tool_call_completed"
  | "tool_call_error"
  | "shell_command_executed"
  | "shell_session_created"
  | "shell_session_terminated"
  | "system_snapshot_captured"
  | "token_burn_threshold_exceeded"
  | "agent_connected"
  | "agent_disconnected";

export interface TelemetryEvent {
  id: string;
  type: TelemetryEventType;
  timestamp: number;
  sessionId: string | null;
  agentId: string | null;
  payload: Record<string, unknown>;
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
  capturedAt: number;
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

export interface TokenBurnWindow {
  windowStart: number;
  windowEnd: number;
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
  agentId: string;
  sessionId: string;
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

export interface ToolCallRecord {
  id: string;
  sessionId: string;
  toolName: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  startedAt: number;
  completedAt: number | null;
  durationMs: number | null;
  status: "pending" | "running" | "success" | "error" | "timeout";
  errorMessage: string | null;
}

export interface ShellSession {
  id: string;
  agentId: string;
  sessionId: string;
  createdAt: number;
  lastActivity: number;
  status: "idle" | "running" | "terminated" | "error";
  cwd: string;
  shell: string;
  totalCommands: number;
}

export interface ServerStatus {
  server: string;
  version: string;
  uptime: number;
  uptimeHuman: string;
  nodeVersion: string;
  platform: string;
  pid: number;
  connectedDashboardClients: number;
  telemetryBufferSize: number;
  config: {
    transport: string;
    port: number;
    maxShellSessions: number;
    rateLimitRpm: number;
    maxCommandTimeoutMs: number;
  };
  timestamp: string;
}

export interface WsHelloFrame {
  clientId: string;
  serverTime: string;
  bufferedEvents: TelemetryEvent[];
}
