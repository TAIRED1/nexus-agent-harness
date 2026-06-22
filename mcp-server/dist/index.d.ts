/**
 * @file index.ts
 * @description Nexus MCP Server — main entry point.
 *
 * Registers all MCP tools, spins up the HTTP/WebSocket transport,
 * and starts the background system telemetry collection loop.
 *
 * Architecture:
 *   ┌─────────────────────────────────────────────────────────┐
 *   │                    MCP Server (McpServer)                │
 *   │  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
 *   │  │ System Tools│  │Token Analytics│  │ Shell Executor│  │
 *   │  └──────┬──────┘  └──────┬───────┘  └──────┬────────┘  │
 *   │         └────────────────┴──────────────────┘           │
 *   │                     Telemetry Bus                        │
 *   │                          │                               │
 *   │                  WebSocket Transport                     │
 *   │                          │                               │
 *   │                 Dashboard Clients (N)                    │
 *   └─────────────────────────────────────────────────────────┘
 */
import "dotenv/config";
//# sourceMappingURL=index.d.ts.map