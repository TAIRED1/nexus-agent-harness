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
import type { ToolCallRecord, TokenBurnAnalytics } from "../types/index.js";
export declare const RecordToolCallInputSchema: z.ZodObject<{
    sessionId: z.ZodString;
    agentId: z.ZodString;
    toolName: z.ZodString;
    inputTokens: z.ZodNumber;
    outputTokens: z.ZodNumber;
    durationMs: z.ZodNumber;
    status: z.ZodEnum<["success", "error", "timeout"]>;
    errorMessage: z.ZodOptional<z.ZodString>;
    inputSizeBytes: z.ZodDefault<z.ZodNumber>;
    outputSizeBytes: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    status: "success" | "error" | "timeout";
    sessionId: string;
    agentId: string;
    toolName: string;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
    inputSizeBytes: number;
    outputSizeBytes: number;
    errorMessage?: string | undefined;
}, {
    status: "success" | "error" | "timeout";
    sessionId: string;
    agentId: string;
    toolName: string;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
    errorMessage?: string | undefined;
    inputSizeBytes?: number | undefined;
    outputSizeBytes?: number | undefined;
}>;
export declare const GetBurnAnalyticsInputSchema: z.ZodObject<{
    sessionId: z.ZodString;
    agentId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    sessionId: string;
    agentId: string;
}, {
    sessionId: string;
    agentId: string;
}>;
export declare const ListToolHistoryInputSchema: z.ZodObject<{
    sessionId: z.ZodString;
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
    toolName: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["pending", "running", "success", "error", "timeout"]>>;
}, "strip", z.ZodTypeAny, {
    sessionId: string;
    page: number;
    pageSize: number;
    status?: "pending" | "running" | "success" | "error" | "timeout" | undefined;
    toolName?: string | undefined;
}, {
    sessionId: string;
    status?: "pending" | "running" | "success" | "error" | "timeout" | undefined;
    toolName?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
}>;
export declare const ResetSessionMetricsInputSchema: z.ZodObject<{
    sessionId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    sessionId: string;
}, {
    sessionId: string;
}>;
export type RecordToolCallInput = z.infer<typeof RecordToolCallInputSchema>;
export type GetBurnAnalyticsInput = z.infer<typeof GetBurnAnalyticsInputSchema>;
export type ListToolHistoryInput = z.infer<typeof ListToolHistoryInputSchema>;
export type ResetSessionMetricsInput = z.infer<typeof ResetSessionMetricsInputSchema>;
export declare function recordToolCall(input: RecordToolCallInput): ToolCallRecord;
export declare function getBurnAnalytics(input: GetBurnAnalyticsInput): TokenBurnAnalytics;
export declare function listToolHistory(input: ListToolHistoryInput): {
    records: ToolCallRecord[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
};
export declare function resetSessionMetrics(input: ResetSessionMetricsInput): {
    deleted: number;
};
//# sourceMappingURL=token-analytics.d.ts.map