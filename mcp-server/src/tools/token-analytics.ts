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

import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import type {
  ToolCallRecord,
  TokenBurnAnalytics,
  TokenBurnWindow,
  ToolCallStatus,
  SessionId,
  AgentId,
  ToolCallId,
  Timestamp,
} from "../types/index.js";
import { telemetryBus } from "../utils/telemetry-bus.js";
import { config } from "../utils/config.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("token-analytics");

// ─── In-Memory Store ───────────────────────────────────────────────────────

const toolCallStore = new Map<ToolCallId, ToolCallRecord>();
const sessionIndex = new Map<SessionId, Set<ToolCallId>>();

// ─── Input Schemas ─────────────────────────────────────────────────────────

export const RecordToolCallInputSchema = z.object({
  sessionId: z
    .string()
    .min(1)
    .describe("Session identifier for the agent invocation"),
  agentId: z
    .string()
    .min(1)
    .describe("Stable identifier for the agent model/version"),
  toolName: z.string().min(1).describe("Name of the MCP tool that was called"),
  inputTokens: z
    .number()
    .int()
    .min(0)
    .describe("Number of input tokens consumed by this tool call"),
  outputTokens: z
    .number()
    .int()
    .min(0)
    .describe("Number of output tokens produced by this tool call"),
  durationMs: z
    .number()
    .int()
    .min(0)
    .describe("Wall-clock execution time in milliseconds"),
  status: z
    .enum(["success", "error", "timeout"])
    .describe("Outcome status of the tool call"),
  errorMessage: z
    .string()
    .optional()
    .describe("Error message if status is 'error'"),
  inputSizeBytes: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Byte size of raw tool input payload"),
  outputSizeBytes: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Byte size of raw tool output payload"),
});

export const GetBurnAnalyticsInputSchema = z.object({
  sessionId: z
    .string()
    .min(1)
    .describe("Session ID to retrieve analytics for"),
  agentId: z
    .string()
    .min(1)
    .describe("Agent ID associated with this session"),
});

export const ListToolHistoryInputSchema = z.object({
  sessionId: z.string().min(1).describe("Session ID to query history for"),
  page: z.number().int().min(1).default(1).describe("Page number (1-indexed)"),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Records per page (max 100)"),
  toolName: z
    .string()
    .optional()
    .describe("Filter results to a specific tool name"),
  status: z
    .enum(["pending", "running", "success", "error", "timeout"])
    .optional()
    .describe("Filter results to a specific status"),
});

export const ResetSessionMetricsInputSchema = z.object({
  sessionId: z.string().min(1).describe("Session ID to reset metrics for"),
});

export type RecordToolCallInput = z.infer<typeof RecordToolCallInputSchema>;
export type GetBurnAnalyticsInput = z.infer<typeof GetBurnAnalyticsInputSchema>;
export type ListToolHistoryInput = z.infer<typeof ListToolHistoryInputSchema>;
export type ResetSessionMetricsInput = z.infer<
  typeof ResetSessionMetricsInputSchema
>;

// ─── Helper Functions ──────────────────────────────────────────────────────

function buildWindow(
  records: ToolCallRecord[],
  windowMs: number
): TokenBurnWindow {
  const now = Date.now();
  const windowStart = (now - windowMs) as Timestamp;
  const windowEnd = now as Timestamp;

  const inWindow = records.filter(
    (r) => r.startedAt >= windowStart && r.completedAt !== null
  );

  const totalInputTokens = inWindow.reduce(
    (s, r) => s + r.inputTokens,
    0
  );
  const totalOutputTokens = inWindow.reduce(
    (s, r) => s + r.outputTokens,
    0
  );
  const totalTokens = totalInputTokens + totalOutputTokens;
  const callCount = inWindow.length;
  const errorCount = inWindow.filter((r) => r.status === "error").length;
  const durations = inWindow
    .map((r) => r.durationMs)
    .filter((d): d is number => d !== null);
  const averageDurationMs =
    durations.length > 0
      ? durations.reduce((s, d) => s + d, 0) / durations.length
      : 0;
  const peakDurationMs =
    durations.length > 0 ? Math.max(...durations) : 0;

  const windowSeconds = windowMs / 1000;
  const tokensPerSecond = windowSeconds > 0 ? totalTokens / windowSeconds : 0;

  const estimatedCostUSD =
    (totalInputTokens / 1000) *
      config.tokens.estimatedInputCostPer1kUSD +
    (totalOutputTokens / 1000) *
      config.tokens.estimatedOutputCostPer1kUSD;

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

export function recordToolCall(
  input: RecordToolCallInput
): ToolCallRecord {
  const id = uuidv4() as ToolCallId;
  const sessionId = input.sessionId as SessionId;
  const agentId = input.agentId as AgentId;
  const now = Date.now() as Timestamp;
  const completedAt = now;
  const startedAt = (now - input.durationMs) as Timestamp;
  const totalTokens = input.inputTokens + input.outputTokens;

  const record: ToolCallRecord = {
    id,
    sessionId,
    toolName: input.toolName,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    totalTokens,
    startedAt,
    completedAt,
    durationMs: input.durationMs,
    status: input.status as ToolCallStatus,
    errorMessage: input.errorMessage ?? null,
    inputSizeBytes: input.inputSizeBytes,
    outputSizeBytes: input.outputSizeBytes,
  };

  toolCallStore.set(id, record);

  if (!sessionIndex.has(sessionId)) {
    sessionIndex.set(sessionId, new Set());
  }
  sessionIndex.get(sessionId)!.add(id);

  telemetryBus.publish("tool_call_completed", {
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
  if (
    oneHourWindow.estimatedCostUSD >=
    config.tokens.burnAlertThresholdPerHour
  ) {
    logger.warn(
      {
        sessionId,
        costUSD: oneHourWindow.estimatedCostUSD,
        threshold: config.tokens.burnAlertThresholdPerHour,
      },
      "Token burn rate threshold exceeded"
    );
    telemetryBus.publish("token_burn_threshold_exceeded", {
      sessionId,
      agentId,
      data: {
        estimatedCostUSD: oneHourWindow.estimatedCostUSD,
        thresholdUSD: config.tokens.burnAlertThresholdPerHour,
        totalTokens: oneHourWindow.totalTokens,
      },
    });
  }

  logger.debug(
    { id, sessionId, toolName: input.toolName, totalTokens },
    "Tool call recorded"
  );

  return record;
}

function getSessionRecords(sessionId: SessionId): ToolCallRecord[] {
  const ids = sessionIndex.get(sessionId);
  if (!ids) return [];
  return [...ids]
    .map((id) => toolCallStore.get(id))
    .filter((r): r is ToolCallRecord => r !== undefined);
}

export function getBurnAnalytics(
  input: GetBurnAnalyticsInput
): TokenBurnAnalytics {
  const sessionId = input.sessionId as SessionId;
  const agentId = input.agentId as AgentId;
  const records = getSessionRecords(sessionId);

  const lifetimeInputTokens = records.reduce(
    (s, r) => s + r.inputTokens,
    0
  );
  const lifetimeOutputTokens = records.reduce(
    (s, r) => s + r.outputTokens,
    0
  );
  const lifetimeTotalTokens =
    lifetimeInputTokens + lifetimeOutputTokens;

  const estimatedCostUSD =
    (lifetimeInputTokens / 1000) *
      config.tokens.estimatedInputCostPer1kUSD +
    (lifetimeOutputTokens / 1000) *
      config.tokens.estimatedOutputCostPer1kUSD;

  // Aggregate per-tool stats
  const toolStats = new Map<
    string,
    { callCount: number; totalTokens: number; totalDuration: number }
  >();
  for (const r of records) {
    const existing = toolStats.get(r.toolName) ?? {
      callCount: 0,
      totalTokens: 0,
      totalDuration: 0,
    };
    toolStats.set(r.toolName, {
      callCount: existing.callCount + 1,
      totalTokens: existing.totalTokens + r.totalTokens,
      totalDuration:
        existing.totalDuration + (r.durationMs ?? 0),
    });
  }

  const topTools = [...toolStats.entries()]
    .sort(([, a], [, b]) => b.totalTokens - a.totalTokens)
    .slice(0, 10)
    .map(([toolName, stats]) => ({
      toolName,
      callCount: stats.callCount,
      totalTokens: stats.totalTokens,
      averageDurationMs:
        stats.callCount > 0
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

export function listToolHistory(input: ListToolHistoryInput): {
  records: ToolCallRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
} {
  const sessionId = input.sessionId as SessionId;
  let records = getSessionRecords(sessionId).sort(
    (a, b) => b.startedAt - a.startedAt
  );

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

export function resetSessionMetrics(
  input: ResetSessionMetricsInput
): { deleted: number } {
  const sessionId = input.sessionId as SessionId;
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
