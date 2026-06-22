# AGENTS.md — Nexus Agent Harness
## Machine-Readable Operational Guide for Autonomous LLM Agents

> **Version:** 1.0.0 | **Stability:** Production | **Updated:** 2026-06-22

---

## 0. CRITICAL — Read First

This document is your **complete operational contract** with the Nexus MCP Server.
Deviation from the patterns described here will result in tool call failures, session leaks, or cost overruns.

**Token budget reminder:** Every tool call costs tokens. Only call tools when necessary. Always call `get_burn_analytics` if you suspect you are in a loop.

---

## 1. Server Identity

```
Service    : nexus-agent-harness v1.0.0
Protocol   : Model Context Protocol (MCP) 2024-11-05
Transport  : HTTP (default) | STDIO (embedded)
MCP URL    : http://localhost:3001/mcp
WS URL     : ws://localhost:3001/ws/telemetry
Health URL : http://localhost:3001/health
```

---

## 2. Tool Catalogue

Tools are grouped into four categories. Each entry lists **name**, **required inputs**, **what it returns**, and **when to use it**.

### 2.1 System Monitoring

#### `system_snapshot`
```
INPUT  : {}  (no parameters required)
OUTPUT : SystemSnapshot { cpu, memory, disks[], network[], topProcesses[], loadAverage, uptime }
USE    : Before executing expensive operations to check available resources.
         After long-running operations to verify system health was not degraded.
COST   : ~200 output tokens
```

#### `cpu_metrics`
```
INPUT  : { includePerCore?: boolean = true }
OUTPUT : CpuMetrics { currentLoad, userLoad, systemLoad, perCoreLoad[] }
USE    : When you need a lightweight CPU check without full snapshot overhead.
COST   : ~100 output tokens
```

#### `memory_metrics`
```
INPUT  : {}
OUTPUT : MemoryMetrics { total, free, used, active, usagePercent, swapUsed }
USE    : Before allocating large memory structures or spawning child processes.
COST   : ~80 output tokens
```

#### `disk_metrics`
```
INPUT  : { minSizeGb?: number = 0 }
OUTPUT : DiskMetrics[] { fs, type, size, used, available, usePercent, mount }
USE    : Before writing large files or checking build artifact sizes.
COST   : ~120 output tokens
```

#### `network_metrics`
```
INPUT  : {}
OUTPUT : NetworkMetrics[] { iface, rxBytesPerSec, txBytesPerSec }
USE    : When diagnosing network-intensive task performance.
COST   : ~80 output tokens
```

#### `process_list`
```
INPUT  : { limit?: 1-50 = 10, sortBy?: "cpu"|"memory"|"pid"|"name" = "cpu" }
OUTPUT : ProcessMetrics[] { pid, name, cpu, mem, command }
USE    : After execute_command to verify no zombie processes were created.
         When CPU is unexpectedly high, to identify the culprit.
COST   : ~150 output tokens
```

---

### 2.2 Token Burn Analytics

#### `record_tool_call`
```
INPUT  : {
  sessionId   : string,   // REQUIRED — your session identifier
  agentId     : string,   // REQUIRED — your stable agent identifier
  toolName    : string,   // REQUIRED — name of the tool called
  inputTokens : integer,  // REQUIRED — input token count
  outputTokens: integer,  // REQUIRED — output token count
  durationMs  : integer,  // REQUIRED — wall-clock execution time
  status      : "success"|"error"|"timeout",
  errorMessage: string?   // required if status="error"
}
OUTPUT : ToolCallRecord { id, sessionId, totalTokens, estimatedCost }
USE    : After EVERY tool call to maintain accurate burn accounting.
         Call this before any other tool to bootstrap the session.
COST   : ~60 output tokens
```

#### `get_burn_analytics`
```
INPUT  : { sessionId: string, agentId: string }
OUTPUT : TokenBurnAnalytics {
  lifetimeTotals: { totalTokens, callCount, estimatedCostUSD },
  windows: { last1m, last5m, last1h },  // rolling burn windows
  topTools: [{ toolName, callCount, totalTokens, averageDurationMs }]
}
USE    : At the START of each agent turn to assess token budget status.
         If last1m.estimatedCostUSD > $0.10, slow down. Pause if > $0.50/min.
COST   : ~300 output tokens
```

#### `list_tool_history`
```
INPUT  : { sessionId: string, page?: 1, pageSize?: 20, toolName?: string, status?: string }
OUTPUT : { records: ToolCallRecord[], total, page, pageSize, totalPages }
USE    : When debugging a failed tool call sequence.
COST   : ~200-500 output tokens depending on pageSize
```

#### `reset_session_metrics`
```
INPUT  : { sessionId: string }
OUTPUT : { deleted: number }
USE    : At the END of a task to clean up session data.
         WARNING: Permanently deletes all analytics for this session.
COST   : ~40 output tokens
```

---

### 2.3 Shell Execution

#### `create_shell_session`
```
INPUT  : {
  sessionId  : string,  // REQUIRED — parent MCP session ID
  agentId    : string,  // REQUIRED — your agent identifier
  cwd?       : string,  // optional — working directory (default: /tmp/nexus-sandbox)
  shell?     : string,  // optional — shell binary (default: /bin/bash)
  environment: {}       // optional — extra environment variables
}
OUTPUT : ShellSession { id: ShellSessionId, status: "idle", cwd, shell }
USE    : Once per task that requires shell execution. Re-use the session for all commands.
         Do NOT create a new session for each command.
COST   : ~80 output tokens
SIDE EFFECT: Counts toward MAX_SHELL_SESSIONS (default: 10 concurrent)
```

#### `execute_command`
```
INPUT  : {
  shellSessionId: string,  // REQUIRED — from create_shell_session
  command       : string,  // REQUIRED — shell command to execute
  timeoutMs?    : number,  // optional — max 30000ms (server enforced)
  captureStderr?: boolean  // default: true
}
OUTPUT : ShellExecutionResult {
  exitCode  : number,
  stdout    : string,
  stderr    : string,
  durationMs: number,
  timedOut  : boolean,
  truncated : boolean  // true if output was capped at MAX_OUTPUT_BYTES
}
USE    : For every shell command execution. Check exitCode before proceeding.
         If truncated=true, use tail/grep to retrieve relevant portions.
COST   : ~100 + output_size output tokens
SECURITY: Blocked patterns: rm -rf /, fork bombs, raw device writes.
          Custom allowlist may be configured by the operator.
```

#### `get_shell_session`
```
INPUT  : { shellSessionId: string, includeHistory?: boolean, historyLimit?: 1-200 }
OUTPUT : ShellSession + { historySlice: ShellCommand[] }
USE    : To inspect session state or retrieve recent command history.
COST   : ~100-400 output tokens depending on historyLimit
```

#### `terminate_shell_session`
```
INPUT  : { shellSessionId: string }
OUTPUT : { terminated: boolean, totalCommands: number }
USE    : ALWAYS call at task completion. Never leave sessions open.
         Sessions not terminated will count against MAX_SHELL_SESSIONS.
COST   : ~40 output tokens
```

#### `list_shell_sessions`
```
INPUT  : { agentId: string, statusFilter?: "idle"|"running"|"terminated"|"error"|"all" }
OUTPUT : ShellSession[]
USE    : To check if you have any leaked sessions from previous runs.
COST   : ~100-400 output tokens
```

---

### 2.4 Meta

#### `server_status`
```
INPUT  : {}
OUTPUT : { uptime, nodeVersion, connectedDashboardClients, telemetryBufferSize, config }
USE    : At the beginning of a new agent run to verify server health.
COST   : ~120 output tokens
```

---

## 3. Canonical Agent Workflow

Follow this EXACT sequence every time you execute a task:

```
TURN 1 — Initialize
  1. server_status            → verify server is healthy
  2. list_shell_sessions      → detect any leaked sessions from prior runs
  3. get_burn_analytics       → check current token budget
  4. create_shell_session     → create ONE session for this task

TURN 2..N — Execute
  5. execute_command          → run commands
  6. [check exitCode]         → if exitCode != 0, analyze stderr before retrying
  7. record_tool_call         → record token usage after each tool call

TURN N+1 — Cleanup
  8. terminate_shell_session  → ALWAYS — even if task failed
  9. reset_session_metrics    → optional — clean up analytics
```

---

## 4. Error Handling Reference

| Exit Code | Meaning | Action |
|-----------|---------|--------|
| 0 | Success | Continue |
| 1 | General error | Inspect stderr, retry once |
| 2 | Misuse of shell builtin | Fix command syntax |
| 126 | Command not executable | Check permissions |
| 127 | Command not found | Install binary or use full path |
| 128+N | Fatal signal N | Process killed; check resources |
| -1 | Process spawn error | Check session state |

**Timeout handling:**
- If `timedOut: true`, the command exceeded the timeout limit
- Do NOT retry a timed-out command without analyzing root cause
- Run `process_list` to check if the process is still running

**Truncation handling:**
- If `truncated: true`, output was cut at MAX_OUTPUT_BYTES (default 512KB)
- Use `execute_command` with `tail -n 50 /path/to/file` to get the last N lines
- Use `grep "pattern" /path/to/file` to extract relevant sections

---

## 5. Rate Limits

```
Max requests per minute : 120 (configurable via RATE_LIMIT_RPM)
HTTP 429 response       : retryAfter: 30 seconds
Max shell sessions      : 10 concurrent (configurable)
Max command timeout     : 30,000 ms (30 seconds)
Max output per command  : 512 KB
```

When you receive HTTP 429, wait exactly `retryAfter` seconds before retrying. Do not use exponential backoff unless the retry also returns 429.

---

## 6. Token Burn Alert Protocol

The server automatically emits `token_burn_threshold_exceeded` events when the hourly burn rate crosses `BURN_ALERT_THRESHOLD_PER_HOUR` (default: $1.00 USD/hour).

**Agent self-monitoring protocol:**
```
IF get_burn_analytics.windows.last1m.estimatedCostUSD > 0.10:
  → Pause. Evaluate if current approach is efficient.

IF get_burn_analytics.windows.last1m.estimatedCostUSD > 0.50:
  → STOP. Report to user. Do not continue without explicit authorization.

IF get_burn_analytics.lifetimeTotals.estimatedCostUSD > 5.00:
  → STOP. Session cost limit exceeded. Report and terminate all sessions.
```

---

## 7. Security Constraints

The following command patterns are **permanently blocked** by the server:

```
rm -rf /
:(){ :|:& };:       (fork bomb)
> /dev/sda          (raw disk write)
mkfs                (filesystem format)
```

Additional patterns may be blocked by operator configuration. If a command returns `[Security] Command blocked`, do not attempt to work around the restriction. Report the blocked command to the user and ask for authorization or an alternative approach.

---

## 8. JSON-RPC Wire Format (MCP over HTTP)

All MCP tool calls are sent as JSON-RPC 2.0 requests:

```json
POST /mcp
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": "unique-request-id",
  "method": "tools/call",
  "params": {
    "name": "execute_command",
    "arguments": {
      "shellSessionId": "your-session-id",
      "command": "ls -la",
      "timeoutMs": 5000
    }
  }
}
```

Response format:
```json
{
  "jsonrpc": "2.0",
  "id": "unique-request-id",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{ ... JSON result ... }"
      }
    ],
    "isError": false
  }
}
```

Error response:
```json
{
  "jsonrpc": "2.0",
  "id": "unique-request-id",
  "error": {
    "code": -32603,
    "message": "Tool execution failed: [ShellExecutor] Shell session not found"
  }
}
```

---

## 9. Session ID Conventions

```
sessionId    : UUID v4 (e.g., "550e8400-e29b-41d4-a716-446655440000")
agentId      : Stable identifier for the agent model (e.g., "claude-sonnet-4-6")
shellSessionId: UUID v4 returned by create_shell_session
toolCallId   : UUID v4 assigned by record_tool_call
```

Use a **single sessionId per agent conversation**. Rotate sessionId only when starting a completely new independent task.

---

## 10. Telemetry WebSocket Protocol

```
URL: ws://localhost:3001/ws/telemetry

On connect: Server sends "hello" frame with last 100 buffered events

Incoming frames:
  { "type": "event", "payload": TelemetryEvent }
  { "type": "hello", "payload": { clientId, serverTime, bufferedEvents[] } }
  { "type": "ack", "payload": { action, subscriptions? } }

Outgoing frames (from client):
  { "action": "subscribe", "subscriptions": ["tool_call_completed", "token_burn_threshold_exceeded"] }
  { "action": "subscribe_all" }
```

Event types:
- `tool_call_started` / `tool_call_completed` / `tool_call_error`
- `shell_command_executed` / `shell_session_created` / `shell_session_terminated`
- `system_snapshot_captured`
- `token_burn_threshold_exceeded`
- `agent_connected` / `agent_disconnected`
