# Nexus Agent Harness — Architecture & Setup Guide

> **Version:** 1.0.0 | **Stack:** Node.js 20+ / TypeScript 5.5 / Next.js 15

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Repository Structure](#2-repository-structure)
3. [MCP Server Deep Dive](#3-mcp-server-deep-dive)
4. [Dashboard UI Deep Dive](#4-dashboard-ui-deep-dive)
5. [Documentation Layer](#5-documentation-layer)
6. [Setup & Installation](#6-setup--installation)
7. [Development Workflow](#7-development-workflow)
8. [JSON-RPC Execution Loop](#8-json-rpc-execution-loop)
9. [Security Model](#9-security-model)
10. [Configuration Reference](#10-configuration-reference)

---

## 1. Architecture Overview

Nexus Agent Harness is a production-ready ecosystem for orchestrating autonomous LLM agents. It provides:

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        NEXUS AGENT HARNESS ECOSYSTEM                       │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    LLM Agent (Claude, GPT-4, etc.)                   │  │
│  │    Uses MCP protocol to invoke tools via JSON-RPC 2.0                │  │
│  └────────────────────────────┬─────────────────────────────────────────┘  │
│                               │ MCP JSON-RPC 2.0                           │
│                               ▼                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    MCP SERVER (Port 3001)                             │  │
│  │                                                                      │  │
│  │  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────────┐   │  │
│  │  │ System Monitor  │  │ Token Analytics   │  │  Shell Executor   │   │  │
│  │  │ ─────────────── │  │ ──────────────── │  │ ─────────────────│   │  │
│  │  │ system_snapshot │  │ record_tool_call  │  │ create_session    │   │  │
│  │  │ cpu_metrics     │  │ get_burn_analytics│  │ execute_command   │   │  │
│  │  │ memory_metrics  │  │ list_tool_history │  │ get_session       │   │  │
│  │  │ disk_metrics    │  │ reset_metrics     │  │ terminate_session │   │  │
│  │  │ network_metrics │  │                   │  │ list_sessions     │   │  │
│  │  │ process_list    │  │                   │  │                   │   │  │
│  │  └────────┬────────┘  └────────┬──────────┘  └────────┬──────────┘   │  │
│  │           └───────────────────┼────────────────────────┘              │  │
│  │                               │                                        │  │
│  │                    ┌──────────▼──────────┐                             │  │
│  │                    │   Telemetry Bus      │                             │  │
│  │                    │ (Ring Buffer: 1000)  │                             │  │
│  │                    └──────────┬───────────┘                            │  │
│  │                               │ WebSocket /ws/telemetry                 │  │
│  └───────────────────────────────┼────────────────────────────────────────┘  │
│                                  │                                            │
│  ┌───────────────────────────────▼────────────────────────────────────────┐  │
│  │                  DASHBOARD UI (Port 3000)                               │  │
│  │                                                                         │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  ┌──────────┐  │  │
│  │  │ System Panel │  │ Token Burn   │  │  Shell Logs   │  │ Event    │  │  │
│  │  │ (Real-time   │  │ Analytics    │  │  Viewer       │  │ Stream   │  │  │
│  │  │  gauges)     │  │ (Burn charts)│  │               │  │          │  │  │
│  │  └──────────────┘  └──────────────┘  └───────────────┘  └──────────┘  │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **Protocol-First**: All agent interactions use the standardized MCP protocol (JSON-RPC 2.0). No proprietary APIs.
2. **Zod-Validated Inputs**: Every tool parameter is validated by Zod schemas before execution. Invalid inputs fail fast with clear error messages.
3. **Branded Types**: TypeScript branded primitive types prevent cross-domain value misuse (e.g., `SessionId` cannot be used where `ShellSessionId` is expected).
4. **Telemetry-First**: Every significant operation emits a structured telemetry event to the bus, enabling real-time dashboard visibility.
5. **Security by Default**: Shell execution is sandboxed with configurable blocklists, allowlists, output caps, and timeouts.
6. **Token-Aware**: Built-in token burn tracking enables agents to self-monitor spending and apply circuit breakers.

---

## 2. Repository Structure

```
nexus-agent-harness/
├── AGENTS.md                    # Machine-readable agent operational guide
├── mcp-server/                  # Layer 1: MCP Server
│   ├── src/
│   │   ├── index.ts             # Main entry point — server bootstrap & tool registration
│   │   ├── types/
│   │   │   └── index.ts         # All branded types, domain interfaces
│   │   ├── tools/
│   │   │   ├── system-monitor.ts # CPU/memory/disk/network/process tools
│   │   │   ├── token-analytics.ts # Token burn tracking & analytics
│   │   │   └── shell-executor.ts  # Isolated shell session management
│   │   ├── transport/
│   │   │   └── websocket-telemetry.ts # WebSocket live event streaming
│   │   ├── middleware/
│   │   │   └── rate-limiter.ts  # Per-IP rate limiting
│   │   └── utils/
│   │       ├── logger.ts        # Pino structured logger
│   │       ├── config.ts        # Env-driven config with Zod validation
│   │       └── telemetry-bus.ts # In-process event bus (ring buffer)
│   ├── tests/                   # Vitest unit tests
│   ├── .env.example             # Environment variables template
│   ├── package.json
│   └── tsconfig.json
├── dashboard-ui/                # Layer 2: Next.js Dashboard
│   ├── src/
│   │   ├── app/                 # Next.js App Router pages
│   │   │   ├── layout.tsx       # Root layout with theme/providers
│   │   │   ├── page.tsx         # Home — overview dashboard
│   │   │   ├── system/page.tsx  # System metrics page
│   │   │   ├── analytics/page.tsx # Token burn analytics page
│   │   │   └── shell/page.tsx   # Shell session logs page
│   │   ├── components/
│   │   │   ├── ui/              # Design system primitives
│   │   │   ├── charts/          # Recharts visualizations
│   │   │   └── panels/          # Feature panels
│   │   ├── hooks/
│   │   │   ├── useTelemetrySocket.ts # WebSocket connection hook
│   │   │   └── useServerStatus.ts    # Server polling hook
│   │   ├── lib/
│   │   │   ├── mcp-client.ts    # MCP tool invocation client
│   │   │   └── types.ts         # Shared TypeScript types
│   │   └── styles/
│   │       └── globals.css      # Design system CSS
│   ├── package.json
│   └── tsconfig.json
└── docs/                        # Layer 3: Documentation
    ├── schemas/
    │   ├── openapi.json         # OpenAPI 3.1.0 REST API spec
    │   └── jsonrpc-tools.json   # JSON-RPC tool schemas
    └── guides/
        └── architecture.md      # This file
```

---

## 3. MCP Server Deep Dive

### 3.1 Tool Registration

Tools are registered using the MCP SDK's `server.tool()` method with:
- A **name** (tool identifier used in JSON-RPC calls)
- A **description** (shown to agents and in tool listings)
- An **inputSchema** (derived from Zod schema `.shape` property)
- An **async handler** (validates input, executes, returns `Content[]`)

```typescript
server.tool(
  "execute_command",
  "Execute a shell command in an existing session...",
  ExecuteCommandInputSchema.shape,   // <- Zod schema shape
  async (args) => {
    const input = ExecuteCommandInputSchema.parse(args); // <- validate
    const result = await executeCommand(input);           // <- execute
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);
```

### 3.2 Telemetry Bus Architecture

The telemetry bus is an in-process `EventEmitter3` instance with a bounded ring buffer:

```
Tool/Subsystem → telemetryBus.emit("event_type", payload)
                         ↓
              Ring Buffer (max 1000 events)
                         ↓
              WebSocket Server.broadcast()
                         ↓
              Dashboard Clients (N)
```

Late-joining dashboard clients receive the last 100 buffered events on connect for instant state hydration.

### 3.3 Token Analytics

Token analytics uses a simple in-memory store with two indexes:
- `toolCallStore: Map<ToolCallId, ToolCallRecord>` — all records
- `sessionIndex: Map<SessionId, Set<ToolCallId>>` — session → record lookup

Rolling windows are computed on-demand by filtering records by timestamp range:

```typescript
function buildWindow(records: ToolCallRecord[], windowMs: number): TokenBurnWindow {
  const inWindow = records.filter(r => r.startedAt >= Date.now() - windowMs);
  // compute aggregates...
}
```

### 3.4 Shell Execution Security Model

Shell sessions enforce security at three levels:

1. **Pattern Blocklist** (`BLOCKED_SHELL_PATTERNS`): Substring matching against known destructive patterns
2. **Command Allowlist** (`ALLOWED_SHELL_COMMANDS`): Optional whitelist of permitted command prefixes
3. **Resource Limits**: Hard timeout and output byte cap enforced by the Node.js child process manager

---

## 4. Dashboard UI Deep Dive

### 4.1 Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | Next.js 15 (App Router) | SSR/SSG + React Server Components |
| Language | TypeScript 5.5 (strict) | Type safety matching the server |
| Styling | Vanilla CSS + CSS Variables | Zero-dependency, full control |
| Charts | Recharts | Composable React chart primitives |
| Real-time | Native WebSocket API | No library overhead for simple pub/sub |
| Data fetching | SWR | Stale-while-revalidate for REST endpoints |

### 4.2 Real-time Architecture

```
WebSocket Connection (ws://localhost:3001/ws/telemetry)
         ↓
useTelemetrySocket() hook
  - Manages connection lifecycle
  - Handles reconnection with exponential backoff
  - Dispatches events to local state
         ↓
Component State (React hooks)
  - systemSnapshot: latest system metrics
  - tokenBurnEvents: burn rate telemetry
  - shellEvents: shell command events
  - allEvents: full event stream (capped at 500)
```

---

## 5. Documentation Layer

### 5.1 AGENTS.md

`/AGENTS.md` at the repository root is the primary machine-readable operational guide for agents. It is designed to be injected into the system prompt or retrieved via the MCP `resources` capability.

Design principles for the AGENTS.md:
- **Token density**: Maximum information per token. No prose padding.
- **Structured lookups**: Table-driven reference sections for quick scanning
- **Canonical patterns**: Exact workflow sequences, not vague guidelines
- **Concrete examples**: JSON snippets for every protocol interaction

### 5.2 OpenAPI Spec (`docs/schemas/openapi.json`)

The OpenAPI 3.1.0 specification covers the REST companion API:
- `GET /health` — liveness/readiness probe
- `GET /api/telemetry/buffer` — buffered event fallback
- `POST /mcp` — MCP JSON-RPC endpoint with full request/response schemas

### 5.3 JSON-RPC Tool Schemas (`docs/schemas/jsonrpc-tools.json`)

Complete JSON Schema definitions for all 14 tools with:
- `inputSchema`: Validated parameter definitions with types, constraints, and defaults
- `outputSchema`: Return value structure (where applicable)
- `category`: Tool grouping (`system`, `analytics`, `shell`, `meta`)

---

## 6. Setup & Installation

### Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0
- (Optional) Docker for containerized deployment

### 6.1 MCP Server Setup

```bash
# Navigate to the MCP server directory
cd mcp-server

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Edit .env for your environment
$EDITOR .env

# Run in development mode (with hot reload)
npm run dev

# Build for production
npm run build

# Run production build
npm start
```

#### Transport Modes

**HTTP Mode** (default — for networked deployment):
```bash
TRANSPORT=http PORT=3001 npm start
# MCP endpoint: http://localhost:3001/mcp
# WebSocket:    ws://localhost:3001/ws/telemetry
```

**STDIO Mode** (for direct LLM client integration):
```bash
TRANSPORT=stdio npm start
# Communicates via stdin/stdout — for use with Claude Desktop, etc.
```

#### Claude Desktop Integration (STDIO Mode)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "nexus-agent-harness": {
      "command": "node",
      "args": ["/path/to/nexus-agent-harness/mcp-server/dist/index.js"],
      "env": {
        "TRANSPORT": "stdio",
        "LOG_LEVEL": "warn"
      }
    }
  }
}
```

### 6.2 Dashboard UI Setup

```bash
cd dashboard-ui

npm install

# Create local env file
echo "NEXT_PUBLIC_MCP_SERVER_URL=http://localhost:3001" > .env.local
echo "NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws/telemetry" >> .env.local

# Run development server
npm run dev
# Dashboard: http://localhost:3000

# Build for production
npm run build && npm start
```

### 6.3 Full Stack (Both Services)

From the repository root:
```bash
# Terminal 1 — MCP Server
cd mcp-server && npm run dev

# Terminal 2 — Dashboard
cd dashboard-ui && npm run dev
```

---

## 7. Development Workflow

### 7.1 TypeScript Compilation

The MCP server uses strict TypeScript with these safety settings enabled:
- `strict: true` — all base strict checks
- `noUncheckedIndexedAccess: true` — array/object access returns `T | undefined`
- `exactOptionalPropertyTypes: true` — cannot pass `undefined` for optional props
- `noImplicitReturns: true` — all code paths must return in non-void functions

To type-check without building:
```bash
cd mcp-server && npm run typecheck
```

### 7.2 Testing

```bash
# Run all tests
cd mcp-server && npm test

# Watch mode
cd mcp-server && npm run test:watch
```

Test files are colocated in `mcp-server/tests/`. Use Vitest's `describe/it/expect` API.

### 7.3 Adding a New Tool

1. **Create the implementation** in `src/tools/your-tool.ts`:
   - Define Zod input schemas
   - Implement the async handler function
   - Emit telemetry events

2. **Register in** `src/index.ts`:
   ```typescript
   import { myHandler, MyInputSchema } from "./tools/your-tool.js";

   server.tool("tool_name", "Description...", MyInputSchema.shape, async (args) => {
     const input = MyInputSchema.parse(args);
     const result = await myHandler(input);
     return { content: [{ type: "text", text: JSON.stringify(result) }] };
   });
   ```

3. **Add schema** to `docs/schemas/jsonrpc-tools.json`

4. **Update** `AGENTS.md` Section 2 with the tool catalogue entry

---

## 8. JSON-RPC Execution Loop

Every agent-tool interaction follows this exact exchange:

```
Agent                    MCP Server
  │                          │
  │── POST /mcp ────────────►│
  │   {                      │
  │     "jsonrpc": "2.0",    │
  │     "id": "turn-42",     │
  │     "method": "tools/call"│
  │     "params": {          │
  │       "name": "execute_command",
  │       "arguments": {     │
  │         "shellSessionId": "abc",
  │         "command": "ls", │
  │         "timeoutMs": 5000│
  │       }                  │
  │     }                    │
  │   }                      │
  │                          │── Validate input (Zod) ─►
  │                          │── Execute handler ────►
  │                          │── Emit telemetry event ►
  │◄── Response ─────────────│
  │   {                      │
  │     "jsonrpc": "2.0",    │
  │     "id": "turn-42",     │
  │     "result": {          │
  │       "content": [{      │
  │         "type": "text",  │
  │         "text": "{...}"  │
  │       }],                │
  │       "isError": false   │
  │     }                    │
  │   }                      │
```

### Session Bootstrap Sequence

```
1. GET /health                    → verify server is up
2. POST /mcp tools/call server_status → get config
3. POST /mcp tools/call create_shell_session → get shellSessionId
4. POST /mcp tools/call execute_command  → run commands
5. POST /mcp tools/call record_tool_call → log token usage
6. POST /mcp tools/call terminate_shell_session → cleanup
```

---

## 9. Security Model

### Shell Execution Sandboxing

| Control | Default | Override |
|---------|---------|----------|
| Command blocklist | `rm -rf /`, fork bombs, device writes | `BLOCKED_SHELL_PATTERNS` env |
| Command allowlist | None (all allowed) | `ALLOWED_SHELL_COMMANDS` env |
| Max timeout | 30,000ms | `MAX_COMMAND_TIMEOUT_MS` env |
| Max output | 512,000 bytes | `MAX_OUTPUT_BYTES` env |
| Max sessions | 10 concurrent | `MAX_SHELL_SESSIONS` env |

### Rate Limiting

The HTTP transport enforces per-IP rate limiting:
- Default: 120 requests per minute
- HTTP 429 with `retryAfter: 30` on breach
- Configurable via `RATE_LIMIT_RPM`

### Network Security

- Helmet.js security headers on all HTTP responses
- CORS enabled (configurable in production)
- No authentication by default (add reverse proxy with auth for production)

---

## 10. Configuration Reference

| Environment Variable | Type | Default | Description |
|---------------------|------|---------|-------------|
| `PORT` | integer | 3001 | HTTP server port |
| `HOST` | string | 0.0.0.0 | Bind address |
| `TRANSPORT` | enum | http | `http` or `stdio` |
| `WS_PORT` | integer | 3002 | WebSocket port (future) |
| `LOG_LEVEL` | enum | info | `debug`, `info`, `warn`, `error` |
| `NODE_ENV` | enum | development | `development`, `production` |
| `ALLOWED_SHELL_COMMANDS` | CSV | null | Comma-separated allowlist (null = all allowed) |
| `BLOCKED_SHELL_PATTERNS` | CSV | (see defaults) | Blocked command substrings |
| `MAX_COMMAND_TIMEOUT_MS` | integer | 30000 | Max shell command timeout (ms) |
| `MAX_OUTPUT_BYTES` | integer | 512000 | Max shell output size (bytes) |
| `RATE_LIMIT_RPM` | integer | 120 | Max HTTP requests per minute per IP |
| `DEFAULT_CWD` | string | process.cwd() | Default shell working directory |
| `MAX_SHELL_SESSIONS` | integer | 10 | Max concurrent shell sessions |
| `SHELL_SESSION_TIMEOUT_MS` | integer | 300000 | Session idle timeout (ms) |
| `DEFAULT_SHELL` | string | $SHELL | Shell binary path |
| `INPUT_COST_PER_1K_USD` | float | 0.003 | Input token cost estimate (USD/1k) |
| `OUTPUT_COST_PER_1K_USD` | float | 0.015 | Output token cost estimate (USD/1k) |
| `BURN_ALERT_THRESHOLD_PER_HOUR` | float | 1.0 | USD/hour threshold for burn alerts |
| `SNAPSHOT_INTERVAL_MS` | integer | 5000 | System metrics collection interval (ms) |
| `TELEMETRY_RETENTION_MS` | integer | 3600000 | Telemetry event retention period (ms) |
