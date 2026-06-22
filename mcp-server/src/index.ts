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
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createServer } from "node:http";
import { z } from "zod";

import { config } from "./utils/config.js";
import { createLogger } from "./utils/logger.js";
import { telemetryBus } from "./utils/telemetry-bus.js";
import { createTelemetryWebSocketServer, getConnectedClientCount } from "./transport/websocket-telemetry.js";
import { rateLimitMiddleware } from "./middleware/rate-limiter.js";

// System Monitor
import {
  getSystemSnapshot,
  getCpuMetrics,
  getMemoryMetrics,
  getDiskMetrics,
  getNetworkMetrics,
  getProcessList,
  CpuMetricsInputSchema,
  DiskMetricsInputSchema,
  ProcessListInputSchema,
} from "./tools/system-monitor.js";

// Token Analytics
import {
  recordToolCall,
  getBurnAnalytics,
  listToolHistory,
  resetSessionMetrics,
  RecordToolCallInputSchema,
  GetBurnAnalyticsInputSchema,
  ListToolHistoryInputSchema,
  ResetSessionMetricsInputSchema,
} from "./tools/token-analytics.js";

// Shell Executor
import {
  createShellSession,
  executeCommand,
  getShellSession,
  terminateShellSession,
  listShellSessions,
  CreateShellSessionInputSchema,
  ExecuteCommandInputSchema,
  GetShellSessionInputSchema,
  TerminateShellSessionInputSchema,
  ListShellSessionsInputSchema,
} from "./tools/shell-executor.js";

const logger = createLogger("server");

// ─── MCP Server Setup ──────────────────────────────────────────────────────

function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "nexus-agent-harness",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // ── System Monitoring Tools ──────────────────────────────────────────────

  server.tool(
    "system_snapshot",
    "Capture a comprehensive system health snapshot including CPU, memory, disk, and network metrics. " +
      "Use this to understand current host resource utilization before spawning resource-intensive tasks.",
    {},
    async () => {
      const snapshot = await getSystemSnapshot();
      return {
        content: [{ type: "text", text: JSON.stringify(snapshot, null, 2) }],
      };
    }
  );

  server.tool(
    "cpu_metrics",
    "Get real-time CPU load breakdown. Returns overall load, per-user/system/idle split, " +
      "and optionally per-core load percentages.",
    CpuMetricsInputSchema.shape,
    async (args) => {
      const input = CpuMetricsInputSchema.parse(args);
      const metrics = await getCpuMetrics(input);
      return {
        content: [{ type: "text", text: JSON.stringify(metrics, null, 2) }],
      };
    }
  );

  server.tool(
    "memory_metrics",
    "Get current memory and swap usage statistics in bytes and percentage.",
    {},
    async () => {
      const metrics = await getMemoryMetrics();
      return {
        content: [{ type: "text", text: JSON.stringify(metrics, null, 2) }],
      };
    }
  );

  server.tool(
    "disk_metrics",
    "Get filesystem usage for all mounted volumes. Optionally filter by minimum size to exclude tmpfs and small mounts.",
    DiskMetricsInputSchema.shape,
    async (args) => {
      const input = DiskMetricsInputSchema.parse(args);
      const metrics = await getDiskMetrics(input);
      return {
        content: [{ type: "text", text: JSON.stringify(metrics, null, 2) }],
      };
    }
  );

  server.tool(
    "network_metrics",
    "Get per-interface network I/O rates (bytes/sec, drops/sec). Excludes loopback interface.",
    {},
    async () => {
      const metrics = await getNetworkMetrics();
      return {
        content: [{ type: "text", text: JSON.stringify(metrics, null, 2) }],
      };
    }
  );

  server.tool(
    "process_list",
    "List the top N processes sorted by CPU, memory, PID, or name. " +
      "Use this to identify runaway processes before or after executing shell commands.",
    ProcessListInputSchema.shape,
    async (args) => {
      const input = ProcessListInputSchema.parse(args);
      const processes = await getProcessList(input);
      return {
        content: [{ type: "text", text: JSON.stringify(processes, null, 2) }],
      };
    }
  );

  // ── Token Analytics Tools ────────────────────────────────────────────────

  server.tool(
    "record_tool_call",
    "Record a completed tool invocation with token consumption data. " +
      "Call this after every tool invocation to maintain accurate burn analytics. " +
      "IMPORTANT: This tool must be called by the agent for accurate tracking.",
    RecordToolCallInputSchema.shape,
    async (args) => {
      const input = RecordToolCallInputSchema.parse(args);
      const record = recordToolCall(input);
      return {
        content: [{ type: "text", text: JSON.stringify(record, null, 2) }],
      };
    }
  );

  server.tool(
    "get_burn_analytics",
    "Retrieve token burn analytics for a session. Includes rolling windows " +
      "(1m, 5m, 1h), per-tool breakdowns, and estimated USD cost. " +
      "Call this to monitor token spending and detect runaway loops.",
    GetBurnAnalyticsInputSchema.shape,
    async (args) => {
      const input = GetBurnAnalyticsInputSchema.parse(args);
      const analytics = getBurnAnalytics(input);
      return {
        content: [{ type: "text", text: JSON.stringify(analytics, null, 2) }],
      };
    }
  );

  server.tool(
    "list_tool_history",
    "Retrieve paginated tool call history for a session with optional filtering by tool name or status.",
    ListToolHistoryInputSchema.shape,
    async (args) => {
      const input = ListToolHistoryInputSchema.parse(args);
      const history = listToolHistory(input);
      return {
        content: [{ type: "text", text: JSON.stringify(history, null, 2) }],
      };
    }
  );

  server.tool(
    "reset_session_metrics",
    "Clear all token analytics data for a session. " +
      "WARNING: This permanently deletes all tool call records for the session.",
    ResetSessionMetricsInputSchema.shape,
    async (args) => {
      const input = ResetSessionMetricsInputSchema.parse(args);
      const result = resetSessionMetrics(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ── Shell Execution Tools ────────────────────────────────────────────────

  server.tool(
    "create_shell_session",
    "Initialize a new isolated shell session for executing commands. " +
      "Returns a shellSessionId to use with execute_command. " +
      "Sessions are isolated per agent and support custom CWD and environment.",
    CreateShellSessionInputSchema.shape,
    async (args) => {
      const input = CreateShellSessionInputSchema.parse(args);
      const session = createShellSession(input);
      return {
        content: [{ type: "text", text: JSON.stringify(session, null, 2) }],
      };
    }
  );

  server.tool(
    "execute_command",
    "Execute a shell command in an existing session. " +
      "Returns stdout, stderr, exit code, duration, and truncation status. " +
      "Commands are subject to security policy (blocklist/allowlist). " +
      "Never execute destructive commands without explicit user authorization.",
    ExecuteCommandInputSchema.shape,
    async (args) => {
      const input = ExecuteCommandInputSchema.parse(args);
      const result = await executeCommand(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    "get_shell_session",
    "Inspect the state of an existing shell session including status, command history, and environment.",
    GetShellSessionInputSchema.shape,
    async (args) => {
      const input = GetShellSessionInputSchema.parse(args);
      const session = getShellSession(input);
      return {
        content: [{ type: "text", text: JSON.stringify(session, null, 2) }],
      };
    }
  );

  server.tool(
    "terminate_shell_session",
    "Cleanly terminate a shell session and release its resources. " +
      "Always call this when the agent is done with a session to prevent resource leaks.",
    TerminateShellSessionInputSchema.shape,
    async (args) => {
      const input = TerminateShellSessionInputSchema.parse(args);
      const result = terminateShellSession(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    "list_shell_sessions",
    "List all shell sessions for an agent, with optional status filtering.",
    ListShellSessionsInputSchema.shape,
    async (args) => {
      const input = ListShellSessionsInputSchema.parse(args);
      const sessions = listShellSessions(input);
      return {
        content: [{ type: "text", text: JSON.stringify(sessions, null, 2) }],
      };
    }
  );

  // ── Meta Tool ────────────────────────────────────────────────────────────

  server.tool(
    "server_status",
    "Get the current Nexus MCP server status including uptime, active connections, and configuration summary.",
    {},
    async () => {
      const status = {
        server: "nexus-agent-harness",
        version: "1.0.0",
        uptime: process.uptime(),
        uptimeHuman: formatUptime(process.uptime()),
        nodeVersion: process.version,
        platform: process.platform,
        pid: process.pid,
        memoryUsage: process.memoryUsage(),
        connectedDashboardClients: getConnectedClientCount(),
        telemetryBufferSize: telemetryBus.bufferSize,
        config: {
          transport: config.server.transport,
          port: config.server.port,
          maxShellSessions: config.shell.maxSessions,
          rateLimitRpm: config.security.rateLimitRequestsPerMinute,
          maxCommandTimeoutMs: config.security.maxCommandTimeout,
        },
        timestamp: new Date().toISOString(),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
      };
    }
  );

  return server;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

// ─── HTTP Express App Setup ────────────────────────────────────────────────

function createExpressApp(): express.Application {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: "*", methods: ["GET", "POST", "DELETE", "OPTIONS"] }));
  app.use(express.json({ limit: "4mb" }));
  app.use(rateLimitMiddleware);

  // Health endpoint
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "nexus-agent-harness",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Metrics summary endpoint (for dashboard REST polling fallback)
  app.get("/api/telemetry/buffer", (_req, res) => {
    const events = telemetryBus.getBuffer({ limit: 200 });
    res.json({ events, count: events.length });
  });

  return app;
}

// ─── System Telemetry Collection Loop ─────────────────────────────────────

function startSystemCollectionLoop(): NodeJS.Timeout {
  logger.info(
    { intervalMs: config.telemetry.snapshotIntervalMs },
    "Starting system telemetry collection loop"
  );

  return setInterval(async () => {
    try {
      await getSystemSnapshot();
    } catch (err) {
      logger.error({ err }, "System snapshot collection failed");
    }
  }, config.telemetry.snapshotIntervalMs);
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  logger.info(
    {
      version: "1.0.0",
      transport: config.server.transport,
      port: config.server.port,
      nodeVersion: process.version,
    },
    "Starting Nexus MCP Server"
  );

  const mcpServer = createMcpServer();

  if (config.server.transport === "stdio") {
    // STDIO transport — for direct LLM agent integration
    const { StdioServerTransport } = await import(
      "@modelcontextprotocol/sdk/server/stdio.js"
    );
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
    logger.info("MCP server connected via STDIO transport");

    // Still start the system collection loop for embedded use
    startSystemCollectionLoop();
  } else {
    // HTTP transport — for network-accessible deployment
    const app = createExpressApp();
    const httpServer = createServer(app);

    // Mount MCP HTTP transport
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });

    app.all("/mcp", async (req, res) => {
      await transport.handleRequest(req, res);
    });

    await mcpServer.connect(transport as any);

    // Mount WebSocket telemetry server on same HTTP server
    createTelemetryWebSocketServer(httpServer);

    // Start background system snapshot collection
    const collectionTimer = startSystemCollectionLoop();

    // Graceful shutdown
    const shutdown = async (signal: string): Promise<void> => {
      logger.info({ signal }, "Received shutdown signal, closing server...");
      clearInterval(collectionTimer);
      httpServer.close(() => {
        logger.info("HTTP server closed");
        process.exit(0);
      });
    };

    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    process.on("SIGINT", () => void shutdown("SIGINT"));

    await new Promise<void>((resolve) => {
      httpServer.listen(config.server.port, config.server.host, () => {
        logger.info(
          {
            host: config.server.host,
            port: config.server.port,
            mcpEndpoint: `http://${config.server.host}:${config.server.port}/mcp`,
            wsEndpoint: `ws://${config.server.host}:${config.server.port}/ws/telemetry`,
            healthEndpoint: `http://${config.server.host}:${config.server.port}/health`,
          },
          "🚀 Nexus MCP Server is running"
        );
        resolve();
      });
    });
  }
}

main().catch((err: unknown) => {
  logger.error({ err }, "Fatal error during server startup");
  process.exit(1);
});
