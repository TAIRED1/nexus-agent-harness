"use strict";
/**
 * @file tools/token-analytics.ts
 * @description Token burn analytics tracker for autonomous LLM agents.
 *
 * Tracks per-session, per-tool token consumption and compute rolling
 * burn windows (1m, 5m, 1h). Emits threshold alerts via the telemetry bus.
 *
 * Tools:
 *   - record_tool_call     : Record a completed tool invocation with token counts
 *   - get_burn_analytics   : Retrieve analytics for a session or globally
 *   - list_tool_history    : Paginated tool call history for a session
 *   - reset_session_metrics: Clear analytics for a given session
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResetSessionMetricsInputSchema = exports.ListToolHistoryInputSchema = exports.GetBurnAnalyticsInputSchema = exports.RecordToolCallInputSchema = void 0;
exports.recordToolCall = recordToolCall;
exports.getBurnAnalytics = getBurnAnalytics;
exports.listToolHistory = listToolHistory;
exports.resetSessionMetrics = resetSessionMetrics;
const zod_1 = require("zod");
const uuid_1 = require("uuid");
const telemetry_bus_js_1 = require("../utils/telemetry-bus.js");
const config_js_1 = require("../utils/config.js");
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createLogger)("token-analytics");
// ─── In-Memory Store ───────────────────────────────────────────────────────
const toolCallStore = new Map();
const sessionIndex = new Map();
// ─── Input Schemas ─────────────────────────────────────────────────────────
exports.RecordToolCallInputSchema = zod_1.z.object({
    sessionId: zod_1.z
        .string()
        .min(1)
        .describe("Session identifier for the agent invocation"),
    agentId: zod_1.z
        .string()
        .min(1)
        .describe("Stable identifier for the agent model/version"),
    toolName: zod_1.z.string().min(1).describe("Name of the MCP tool that was called"),
    inputTokens: zod_1.z
        .number()
        .int()
        .min(0)
        .describe("Number of input tokens consumed by this tool call"),
    outputTokens: zod_1.z
        .number()
        .int()
        .min(0)
        .describe("Number of output tokens produced by this tool call"),
    durationMs: zod_1.z
        .number()
        .int()
        .min(0)
        .describe("Wall-clock execution time in milliseconds"),
    status: zod_1.z
        .enum(["success", "error", "timeout"])
        .describe("Outcome status of the tool call"),
    errorMessage: zod_1.z
        .string()
        .optional()
        .describe("Error message if status is 'error'"),
    inputSizeBytes: zod_1.z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe("Byte size of raw tool input payload"),
    outputSizeBytes: zod_1.z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe("Byte size of raw tool output payload"),
});
exports.GetBurnAnalyticsInputSchema = zod_1.z.object({
    sessionId: zod_1.z
        .string()
        .min(1)
        .describe("Session ID to retrieve analytics for"),
    agentId: zod_1.z
        .string()
        .min(1)
        .describe("Agent ID associated with this session"),
});
exports.ListToolHistoryInputSchema = zod_1.z.object({
    sessionId: zod_1.z.string().min(1).describe("Session ID to query history for"),
    page: zod_1.z.number().int().min(1).default(1).describe("Page number (1-indexed)"),
    pageSize: zod_1.z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe("Records per page (max 100)"),
    toolName: zod_1.z
        .string()
        .optional()
        .describe("Filter results to a specific tool name"),
    status: zod_1.z
        .enum(["pending", "running", "success", "error", "timeout"])
        .optional()
        .describe("Filter results to a specific status"),
});
exports.ResetSessionMetricsInputSchema = zod_1.z.object({
    sessionId: zod_1.z.string().min(1).describe("Session ID to reset metrics for"),
});
// ─── Helper Functions ──────────────────────────────────────────────────────
function buildWindow(records, windowMs) {
    const now = Date.now();
    const windowStart = (now - windowMs);
    const windowEnd = now;
    const inWindow = records.filter((r) => r.startedAt >= windowStart && r.completedAt !== null);
    const totalInputTokens = inWindow.reduce((s, r) => s + r.inputTokens, 0);
    const totalOutputTokens = inWindow.reduce((s, r) => s + r.outputTokens, 0);
    const totalTokens = totalInputTokens + totalOutputTokens;
    const callCount = inWindow.length;
    const errorCount = inWindow.filter((r) => r.status === "error").length;
    const durations = inWindow
        .map((r) => r.durationMs)
        .filter((d) => d !== null);
    const averageDurationMs = durations.length > 0
        ? durations.reduce((s, d) => s + d, 0) / durations.length
        : 0;
    const peakDurationMs = durations.length > 0 ? Math.max(...durations) : 0;
    const windowSeconds = windowMs / 1000;
    const tokensPerSecond = windowSeconds > 0 ? totalTokens / windowSeconds : 0;
    const estimatedCostUSD = (totalInputTokens / 1000) *
        config_js_1.config.tokens.estimatedInputCostPer1kUSD +
        (totalOutputTokens / 1000) *
            config_js_1.config.tokens.estimatedOutputCostPer1kUSD;
    return {
        windowStart,
        windowEnd,
        totalInputTokens,
        totalOutputTokens,
        totalTokens,
        callCount,
        errorCount,
        averageDurationMs,
        peakDurationMs,
        tokensPerSecond,
        estimatedCostUSD,
    };
}
// ─── Tool Implementations ──────────────────────────────────────────────────
function recordToolCall(input) {
    const id = (0, uuid_1.v4)();
    const sessionId = input.sessionId;
    const agentId = input.agentId;
    const now = Date.now();
    const completedAt = now;
    const startedAt = (now - input.durationMs);
    const totalTokens = input.inputTokens + input.outputTokens;
    const record = {
        id,
        sessionId,
        toolName: input.toolName,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        totalTokens,
        startedAt,
        completedAt,
        durationMs: input.durationMs,
        status: input.status,
        errorMessage: input.errorMessage ?? null,
        inputSizeBytes: input.inputSizeBytes,
        outputSizeBytes: input.outputSizeBytes,
    };
    toolCallStore.set(id, record);
    if (!sessionIndex.has(sessionId)) {
        sessionIndex.set(sessionId, new Set());
    }
    sessionIndex.get(sessionId).add(id);
    telemetry_bus_js_1.telemetryBus.publish("tool_call_completed", {
        sessionId,
        agentId,
        data: {
            toolName: input.toolName,
            status: input.status,
            totalTokens,
            durationMs: input.durationMs,
        },
    });
    // Check burn rate threshold
    const hourWindow = getSessionRecords(sessionId);
    const oneHourWindow = buildWindow(hourWindow, 3_600_000);
    if (oneHourWindow.estimatedCostUSD >=
        config_js_1.config.tokens.burnAlertThresholdPerHour) {
        logger.warn({
            sessionId,
            costUSD: oneHourWindow.estimatedCostUSD,
            threshold: config_js_1.config.tokens.burnAlertThresholdPerHour,
        }, "Token burn rate threshold exceeded");
        telemetry_bus_js_1.telemetryBus.publish("token_burn_threshold_exceeded", {
            sessionId,
            agentId,
            data: {
                estimatedCostUSD: oneHourWindow.estimatedCostUSD,
                thresholdUSD: config_js_1.config.tokens.burnAlertThresholdPerHour,
                totalTokens: oneHourWindow.totalTokens,
            },
        });
    }
    logger.debug({ id, sessionId, toolName: input.toolName, totalTokens }, "Tool call recorded");
    return record;
}
function getSessionRecords(sessionId) {
    const ids = sessionIndex.get(sessionId);
    if (!ids)
        return [];
    return [...ids]
        .map((id) => toolCallStore.get(id))
        .filter((r) => r !== undefined);
}
function getBurnAnalytics(input) {
    const sessionId = input.sessionId;
    const agentId = input.agentId;
    const records = getSessionRecords(sessionId);
    const lifetimeInputTokens = records.reduce((s, r) => s + r.inputTokens, 0);
    const lifetimeOutputTokens = records.reduce((s, r) => s + r.outputTokens, 0);
    const lifetimeTotalTokens = lifetimeInputTokens + lifetimeOutputTokens;
    const estimatedCostUSD = (lifetimeInputTokens / 1000) *
        config_js_1.config.tokens.estimatedInputCostPer1kUSD +
        (lifetimeOutputTokens / 1000) *
            config_js_1.config.tokens.estimatedOutputCostPer1kUSD;
    // Aggregate per-tool stats
    const toolStats = new Map();
    for (const r of records) {
        const existing = toolStats.get(r.toolName) ?? {
            callCount: 0,
            totalTokens: 0,
            totalDuration: 0,
        };
        toolStats.set(r.toolName, {
            callCount: existing.callCount + 1,
            totalTokens: existing.totalTokens + r.totalTokens,
            totalDuration: existing.totalDuration + (r.durationMs ?? 0),
        });
    }
    const topTools = [...toolStats.entries()]
        .sort(([, a], [, b]) => b.totalTokens - a.totalTokens)
        .slice(0, 10)
        .map(([toolName, stats]) => ({
        toolName,
        callCount: stats.callCount,
        totalTokens: stats.totalTokens,
        averageDurationMs: stats.callCount > 0
            ? stats.totalDuration / stats.callCount
            : 0,
    }));
    return {
        agentId,
        sessionId,
        lifetimeTotals: {
            inputTokens: lifetimeInputTokens,
            outputTokens: lifetimeOutputTokens,
            totalTokens: lifetimeTotalTokens,
            callCount: records.length,
            errorCount: records.filter((r) => r.status === "error").length,
            estimatedCostUSD,
        },
        windows: {
            last1m: buildWindow(records, 60_000),
            last5m: buildWindow(records, 300_000),
            last1h: buildWindow(records, 3_600_000),
        },
        topTools,
    };
}
function listToolHistory(input) {
    const sessionId = input.sessionId;
    let records = getSessionRecords(sessionId).sort((a, b) => b.startedAt - a.startedAt);
    if (input.toolName) {
        const name = input.toolName;
        records = records.filter((r) => r.toolName === name);
    }
    if (input.status) {
        const status = input.status;
        records = records.filter((r) => r.status === status);
    }
    const total = records.length;
    const totalPages = Math.ceil(total / input.pageSize);
    const offset = (input.page - 1) * input.pageSize;
    const paginated = records.slice(offset, offset + input.pageSize);
    return {
        records: paginated,
        total,
        page: input.page,
        pageSize: input.pageSize,
        totalPages,
    };
}
function resetSessionMetrics(input) {
    const sessionId = input.sessionId;
    const ids = sessionIndex.get(sessionId);
    if (!ids) {
        return { deleted: 0 };
    }
    let deleted = 0;
    for (const id of ids) {
        toolCallStore.delete(id);
        deleted++;
    }
    sessionIndex.delete(sessionId);
    logger.info({ sessionId, deleted }, "Session metrics reset");
    return { deleted };
}
//# sourceMappingURL=token-analytics.js.map