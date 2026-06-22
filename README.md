# Nexus Agent Harness

> **Production-ready ecosystem for orchestrating autonomous LLM agents via the Model Context Protocol (MCP)**

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://typescriptlang.org)
[![MCP](https://img.shields.io/badge/MCP-2024--11--05-purple)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## Overview

Nexus Agent Harness is a three-layer ecosystem that gives autonomous LLM agents (Claude, GPT-4, etc.) production-grade infrastructure:

| Layer | Location | Purpose |
|-------|----------|---------|
| **MCP Server** | `/mcp-server` | 14 MCP tools: system monitoring, token analytics, shell execution |
| **Dashboard UI** | `/dashboard-ui` | Real-time Next.js dashboard with live telemetry |
| **Documentation** | `/docs` | AGENTS.md, OpenAPI spec, JSON-RPC tool schemas |

---

## Quick Start

```bash
# 1. Clone and navigate to the project
cd nexus-agent-harness

# 2. Start the MCP Server
cd mcp-server
npm install
cp .env.example .env
npm run dev
# MCP endpoint:  http://localhost:3001/mcp
# WebSocket:     ws://localhost:3001/ws/telemetry
# Health:        http://localhost:3001/health

# 3. Start the Dashboard (in a new terminal)
cd dashboard-ui
npm install
npm run dev
# Dashboard: http://localhost:3000
```

---

## Architecture

```
LLM Agent (Claude, GPT-4, etc.)
    │ MCP JSON-RPC 2.0
    ▼
MCP Server (Port 3001)
├── System Monitor Tools     → cpu_metrics, memory_metrics, disk_metrics, ...
├── Token Analytics Tools    → record_tool_call, get_burn_analytics, ...
├── Shell Execution Tools    → create_shell_session, execute_command, ...
└── Telemetry Bus ─────────────────────────────────────────────────────┐
                                                                        │ WebSocket
Dashboard UI (Port 3000)                                                │
├── Overview page            ← Live KPIs, system gauges, event stream ◄┘
├── System page              ← CPU/memory/disk/process monitoring
├── Token Analytics page     ← Burn rate charts, per-tool breakdowns
├── Shell Sessions page      ← Session list, command history
└── Event Stream page        ← Filterable real-time event log
```

---

## MCP Tool Catalogue

### System Monitoring
| Tool | Description | Cost |
|------|-------------|------|
| `system_snapshot` | Full system health snapshot | ~200 tokens |
| `cpu_metrics` | Real-time CPU load | ~100 tokens |
| `memory_metrics` | Memory & swap usage | ~80 tokens |
| `disk_metrics` | Filesystem usage | ~120 tokens |
| `network_metrics` | Network I/O rates | ~80 tokens |
| `process_list` | Top N processes | ~150 tokens |

### Token Analytics
| Tool | Description | Cost |
|------|-------------|------|
| `record_tool_call` | Record a tool invocation | ~60 tokens |
| `get_burn_analytics` | Rolling burn windows + cost | ~300 tokens |
| `list_tool_history` | Paginated tool history | ~200-500 tokens |
| `reset_session_metrics` | Clear session data | ~40 tokens |

### Shell Execution
| Tool | Description | Cost |
|------|-------------|------|
| `create_shell_session` | Create isolated shell session | ~80 tokens |
| `execute_command` | Run a shell command | ~100+ tokens |
| `get_shell_session` | Inspect session state | ~100-400 tokens |
| `terminate_shell_session` | Clean up session | ~40 tokens |
| `list_shell_sessions` | List sessions for an agent | ~100-400 tokens |

### Meta
| Tool | Description | Cost |
|------|-------------|------|
| `server_status` | Server health + config | ~120 tokens |

---

## Agent Integration

### Claude Desktop (STDIO Mode)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "nexus": {
      "command": "node",
      "args": ["/path/to/nexus-agent-harness/mcp-server/dist/index.js"],
      "env": { "TRANSPORT": "stdio" }
    }
  }
}
```

### HTTP Mode (Any MCP Client)

```
POST http://localhost:3001/mcp
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "tools/call",
  "params": {
    "name": "system_snapshot",
    "arguments": {}
  }
}
```

---

## Documentation

- **[AGENTS.md](./AGENTS.md)** — Machine-readable agent operational guide
- **[Architecture Guide](./docs/guides/architecture.md)** — Deep-dive architecture, setup, and development
- **[OpenAPI Spec](./docs/schemas/openapi.json)** — REST API documentation
- **[JSON-RPC Tool Schemas](./docs/schemas/jsonrpc-tools.json)** — Tool input/output schemas

---

## Configuration

The MCP server is fully configurable via environment variables. See [`.env.example`](./mcp-server/.env.example) for all options.

Key variables:
- `PORT` — HTTP server port (default: 3001)
- `TRANSPORT` — `http` or `stdio` (default: http)
- `MAX_SHELL_SESSIONS` — Max concurrent shell sessions (default: 10)
- `BURN_ALERT_THRESHOLD_PER_HOUR` — USD/hr alert threshold (default: $1.00)
- `RATE_LIMIT_RPM` — Requests per minute per IP (default: 120)

---

## Security

- **Shell blocklist**: `rm -rf /`, fork bombs, raw device writes are permanently blocked
- **Rate limiting**: 120 req/min per IP (configurable)
- **Output capping**: Max 512KB per command output
- **Timeout enforcement**: Max 30s per command

---

## License

MIT © Nexus Agent Harness
