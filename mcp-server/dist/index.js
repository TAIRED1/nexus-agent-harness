"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const streamableHttp_js_1 = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const node_http_1 = require("node:http");
const config_js_1 = require("./utils/config.js");
const logger_js_1 = require("./utils/logger.js");
const telemetry_bus_js_1 = require("./utils/telemetry-bus.js");
const websocket_telemetry_js_1 = require("./transport/websocket-telemetry.js");
const rate_limiter_js_1 = require("./middleware/rate-limiter.js");
// System Monitor
const system_monitor_js_1 = require("./tools/system-monitor.js");
// Token Analytics
const token_analytics_js_1 = require("./tools/token-analytics.js");
// Shell Executor
const shell_executor_js_1 = require("./tools/shell-executor.js");
const logger = (0, logger_js_1.createLogger)("server");
// ─── MCP Server Setup ──────────────────────────────────────────────────────
function createMcpServer() {
    const server = new mcp_js_1.McpServer({
        name: "nexus-agent-harness",
        version: "1.0.0",
    }, {
        capabilities: {
            tools: {},
        },
    });
    // ── System Monitoring Tools ──────────────────────────────────────────────
    server.tool("system_snapshot", "Capture a comprehensive system health snapshot including CPU, memory, disk, and network metrics. " +
        "Use this to understand current host resource utilization before spawning resource-intensive tasks.", {}, async () => {
        const snapshot = await (0, system_monitor_js_1.getSystemSnapshot)();
        return {
            content: [{ type: "text", text: JSON.stringify(snapshot, null, 2) }],
        };
    });
    server.tool("cpu_metrics", "Get real-time CPU load breakdown. Returns overall load, per-user/system/idle split, " +
        "and optionally per-core load percentages.", system_monitor_js_1.CpuMetricsInputSchema.shape, async (args) => {
        const input = system_monitor_js_1.CpuMetricsInputSchema.parse(args);
        const metrics = await (0, system_monitor_js_1.getCpuMetrics)(input);
        return {
            content: [{ type: "text", text: JSON.stringify(metrics, null, 2) }],
        };
    });
    server.tool("memory_metrics", "Get current memory and swap usage statistics in bytes and percentage.", {}, async () => {
        const metrics = await (0, system_monitor_js_1.getMemoryMetrics)();
        return {
            content: [{ type: "text", text: JSON.stringify(metrics, null, 2) }],
        };
    });
    server.tool("disk_metrics", "Get filesystem usage for all mounted volumes. Optionally filter by minimum size to exclude tmpfs and small mounts.", system_monitor_js_1.DiskMetricsInputSchema.shape, async (args) => {
        const input = system_monitor_js_1.DiskMetricsInputSchema.parse(args);
        const metrics = await (0, system_monitor_js_1.getDiskMetrics)(input);
        return {
            content: [{ type: "text", text: JSON.stringify(metrics, null, 2) }],
        };
    });
    server.tool("network_metrics", "Get per-interface network I/O rates (bytes/sec, drops/sec). Excludes loopback interface.", {}, async () => {
        const metrics = await (0, system_monitor_js_1.getNetworkMetrics)();
        return {
            content: [{ type: "text", text: JSON.stringify(metrics, null, 2) }],
        };
    });
    server.tool("process_list", "List the top N processes sorted by CPU, memory, PID, or name. " +
        "Use this to identify runaway processes before or after executing shell commands.", system_monitor_js_1.ProcessListInputSchema.shape, async (args) => {
        const input = system_monitor_js_1.ProcessListInputSchema.parse(args);
        const processes = await (0, system_monitor_js_1.getProcessList)(input);
        return {
            content: [{ type: "text", text: JSON.stringify(processes, null, 2) }],
        };
    });
    // ── Token Analytics Tools ────────────────────────────────────────────────
    server.tool("record_tool_call", "Record a completed tool invocation with token consumption data. " +
        "Call this after every tool invocation to maintain accurate burn analytics. " +
        "IMPORTANT: This tool must be called by the agent for accurate tracking.", token_analytics_js_1.RecordToolCallInputSchema.shape, async (args) => {
        const input = token_analytics_js_1.RecordToolCallInputSchema.parse(args);
        const record = (0, token_analytics_js_1.recordToolCall)(input);
        return {
            content: [{ type: "text", text: JSON.stringify(record, null, 2) }],
        };
    });
    server.tool("get_burn_analytics", "Retrieve token burn analytics for a session. Includes rolling windows " +
        "(1m, 5m, 1h), per-tool breakdowns, and estimated USD cost. " +
        "Call this to monitor token spending and detect runaway loops.", token_analytics_js_1.GetBurnAnalyticsInputSchema.shape, async (args) => {
        const input = token_analytics_js_1.GetBurnAnalyticsInputSchema.parse(args);
        const analytics = (0, token_analytics_js_1.getBurnAnalytics)(input);
        return {
            content: [{ type: "text", text: JSON.stringify(analytics, null, 2) }],
        };
    });
    server.tool("list_tool_history", "Retrieve paginated tool call history for a session with optional filtering by tool name or status.", token_analytics_js_1.ListToolHistoryInputSchema.shape, async (args) => {
        const input = token_analytics_js_1.ListToolHistoryInputSchema.parse(args);
        const history = (0, token_analytics_js_1.listToolHistory)(input);
        return {
            content: [{ type: "text", text: JSON.stringify(history, null, 2) }],
        };
    });
    server.tool("reset_session_metrics", "Clear all token analytics data for a session. " +
        "WARNING: This permanently deletes all tool call records for the session.", token_analytics_js_1.ResetSessionMetricsInputSchema.shape, async (args) => {
        const input = token_analytics_js_1.ResetSessionMetricsInputSchema.parse(args);
        const result = (0, token_analytics_js_1.resetSessionMetrics)(input);
        return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
    });
    // ── Shell Execution Tools ────────────────────────────────────────────────
    server.tool("create_shell_session", "Initialize a new isolated shell session for executing commands. " +
        "Returns a shellSessionId to use with execute_command. " +
        "Sessions are isolated per agent and support custom CWD and environment.", shell_executor_js_1.CreateShellSessionInputSchema.shape, async (args) => {
        const input = shell_executor_js_1.CreateShellSessionInputSchema.parse(args);
        const session = (0, shell_executor_js_1.createShellSession)(input);
        return {
            content: [{ type: "text", text: JSON.stringify(session, null, 2) }],
        };
    });
    server.tool("execute_command", "Execute a shell command in an existing session. " +
        "Returns stdout, stderr, exit code, duration, and truncation status. " +
        "Commands are subject to security policy (blocklist/allowlist). " +
        "Never execute destructive commands without explicit user authorization.", shell_executor_js_1.ExecuteCommandInputSchema.shape, async (args) => {
        const input = shell_executor_js_1.ExecuteCommandInputSchema.parse(args);
        const result = await (0, shell_executor_js_1.executeCommand)(input);
        return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
    });
    server.tool("get_shell_session", "Inspect the state of an existing shell session including status, command history, and environment.", shell_executor_js_1.GetShellSessionInputSchema.shape, async (args) => {
        const input = shell_executor_js_1.GetShellSessionInputSchema.parse(args);
        const session = (0, shell_executor_js_1.getShellSession)(input);
        return {
            content: [{ type: "text", text: JSON.stringify(session, null, 2) }],
        };
    });
    server.tool("terminate_shell_session", "Cleanly terminate a shell session and release its resources. " +
        "Always call this when the agent is done with a session to prevent resource leaks.", shell_executor_js_1.TerminateShellSessionInputSchema.shape, async (args) => {
        const input = shell_executor_js_1.TerminateShellSessionInputSchema.parse(args);
        const result = (0, shell_executor_js_1.terminateShellSession)(input);
        return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
    });
    server.tool("list_shell_sessions", "List all shell sessions for an agent, with optional status filtering.", shell_executor_js_1.ListShellSessionsInputSchema.shape, async (args) => {
        const input = shell_executor_js_1.ListShellSessionsInputSchema.parse(args);
        const sessions = (0, shell_executor_js_1.listShellSessions)(input);
        return {
            content: [{ type: "text", text: JSON.stringify(sessions, null, 2) }],
        };
    });
    // ── Meta Tool ────────────────────────────────────────────────────────────
    server.tool("server_status", "Get the current Nexus MCP server status including uptime, active connections, and configuration summary.", {}, async () => {
        const status = {
            server: "nexus-agent-harness",
            version: "1.0.0",
            uptime: process.uptime(),
            uptimeHuman: formatUptime(process.uptime()),
            nodeVersion: process.version,
            platform: process.platform,
            pid: process.pid,
            memoryUsage: process.memoryUsage(),
            connectedDashboardClients: (0, websocket_telemetry_js_1.getConnectedClientCount)(),
            telemetryBufferSize: telemetry_bus_js_1.telemetryBus.bufferSize,
            config: {
                transport: config_js_1.config.server.transport,
                port: config_js_1.config.server.port,
                maxShellSessions: config_js_1.config.shell.maxSessions,
                rateLimitRpm: config_js_1.config.security.rateLimitRequestsPerMinute,
                maxCommandTimeoutMs: config_js_1.config.security.maxCommandTimeout,
            },
            timestamp: new Date().toISOString(),
        };
        return {
            content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
        };
    });
    return server;
}
function formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const parts = [];
    if (d > 0)
        parts.push(`${d}d`);
    if (h > 0)
        parts.push(`${h}h`);
    if (m > 0)
        parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(" ");
}
// ─── HTTP Express App Setup ────────────────────────────────────────────────
function createExpressApp() {
    const app = (0, express_1.default)();
    app.use((0, helmet_1.default)());
    app.use((0, cors_1.default)({ origin: "*", methods: ["GET", "POST", "DELETE", "OPTIONS"] }));
    app.use(express_1.default.json({ limit: "4mb" }));
    app.use(rate_limiter_js_1.rateLimitMiddleware);
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
        const events = telemetry_bus_js_1.telemetryBus.getBuffer({ limit: 200 });
        res.json({ events, count: events.length });
    });
    return app;
}
// ─── System Telemetry Collection Loop ─────────────────────────────────────
function startSystemCollectionLoop() {
    logger.info({ intervalMs: config_js_1.config.telemetry.snapshotIntervalMs }, "Starting system telemetry collection loop");
    return setInterval(async () => {
        try {
            await (0, system_monitor_js_1.getSystemSnapshot)();
        }
        catch (err) {
            logger.error({ err }, "System snapshot collection failed");
        }
    }, config_js_1.config.telemetry.snapshotIntervalMs);
}
// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
    logger.info({
        version: "1.0.0",
        transport: config_js_1.config.server.transport,
        port: config_js_1.config.server.port,
        nodeVersion: process.version,
    }, "Starting Nexus MCP Server");
    const mcpServer = createMcpServer();
    if (config_js_1.config.server.transport === "stdio") {
        // STDIO transport — for direct LLM agent integration
        const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
        const transport = new StdioServerTransport();
        await mcpServer.connect(transport);
        logger.info("MCP server connected via STDIO transport");
        // Still start the system collection loop for embedded use
        startSystemCollectionLoop();
    }
    else {
        // HTTP transport — for network-accessible deployment
        const app = createExpressApp();
        const httpServer = (0, node_http_1.createServer)(app);
        // Mount MCP HTTP transport
        const transport = new streamableHttp_js_1.StreamableHTTPServerTransport({
            sessionIdGenerator: () => crypto.randomUUID(),
        });
        app.all("/mcp", async (req, res) => {
            await transport.handleRequest(req, res);
        });
        await mcpServer.connect(transport);
        // Mount WebSocket telemetry server on same HTTP server
        (0, websocket_telemetry_js_1.createTelemetryWebSocketServer)(httpServer);
        // Start background system snapshot collection
        const collectionTimer = startSystemCollectionLoop();
        // Graceful shutdown
        const shutdown = async (signal) => {
            logger.info({ signal }, "Received shutdown signal, closing server...");
            clearInterval(collectionTimer);
            httpServer.close(() => {
                logger.info("HTTP server closed");
                process.exit(0);
            });
        };
        process.on("SIGTERM", () => void shutdown("SIGTERM"));
        process.on("SIGINT", () => void shutdown("SIGINT"));
        await new Promise((resolve) => {
            httpServer.listen(config_js_1.config.server.port, config_js_1.config.server.host, () => {
                logger.info({
                    host: config_js_1.config.server.host,
                    port: config_js_1.config.server.port,
                    mcpEndpoint: `http://${config_js_1.config.server.host}:${config_js_1.config.server.port}/mcp`,
                    wsEndpoint: `ws://${config_js_1.config.server.host}:${config_js_1.config.server.port}/ws/telemetry`,
                    healthEndpoint: `http://${config_js_1.config.server.host}:${config_js_1.config.server.port}/health`,
                }, "🚀 Nexus MCP Server is running");
                resolve();
            });
        });
    }
}
main().catch((err) => {
    logger.error({ err }, "Fatal error during server startup");
    process.exit(1);
});
//# sourceMappingURL=index.js.map