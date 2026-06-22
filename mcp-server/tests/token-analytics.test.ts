/**
 * @file tests/token-analytics.test.ts
 * Vitest unit tests for the token analytics module.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  recordToolCall,
  getBurnAnalytics,
  listToolHistory,
  resetSessionMetrics,
} from "../src/tools/token-analytics.js";

const SESSION_ID = "test-session-001";
const AGENT_ID = "test-agent-001";

describe("Token Analytics", () => {
  describe("recordToolCall", () => {
    it("records a successful tool call", () => {
      const record = recordToolCall({
        sessionId: SESSION_ID,
        agentId: AGENT_ID,
        toolName: "system_snapshot",
        inputTokens: 50,
        outputTokens: 200,
        durationMs: 120,
        status: "success",
        inputSizeBytes: 100,
        outputSizeBytes: 2000,
      });

      expect(record.id).toBeTruthy();
      expect(record.toolName).toBe("system_snapshot");
      expect(record.totalTokens).toBe(250);
      expect(record.status).toBe("success");
      expect(record.errorMessage).toBeNull();
    });

    it("records a failed tool call with error message", () => {
      const record = recordToolCall({
        sessionId: SESSION_ID,
        agentId: AGENT_ID,
        toolName: "execute_command",
        inputTokens: 30,
        outputTokens: 10,
        durationMs: 5000,
        status: "error",
        errorMessage: "Shell session not found",
        inputSizeBytes: 60,
        outputSizeBytes: 50,
      });

      expect(record.status).toBe("error");
      expect(record.errorMessage).toBe("Shell session not found");
    });
  });

  describe("getBurnAnalytics", () => {
    it("returns empty analytics for unknown session", () => {
      const analytics = getBurnAnalytics({
        sessionId: "nonexistent-session",
        agentId: AGENT_ID,
      });

      expect(analytics.lifetimeTotals.callCount).toBe(0);
      expect(analytics.lifetimeTotals.totalTokens).toBe(0);
      expect(analytics.lifetimeTotals.estimatedCostUSD).toBe(0);
    });

    it("correctly aggregates multiple tool calls", () => {
      const sessionId = `session-agg-${Date.now()}`;
      const agentId = "test-agent-agg";

      recordToolCall({
        sessionId,
        agentId,
        toolName: "cpu_metrics",
        inputTokens: 10,
        outputTokens: 100,
        durationMs: 50,
        status: "success",
        inputSizeBytes: 20,
        outputSizeBytes: 500,
      });

      recordToolCall({
        sessionId,
        agentId,
        toolName: "memory_metrics",
        inputTokens: 10,
        outputTokens: 80,
        durationMs: 40,
        status: "success",
        inputSizeBytes: 20,
        outputSizeBytes: 400,
      });

      const analytics = getBurnAnalytics({ sessionId, agentId });

      expect(analytics.lifetimeTotals.callCount).toBe(2);
      expect(analytics.lifetimeTotals.totalTokens).toBe(200);
      expect(analytics.topTools).toHaveLength(2);
    });
  });

  describe("listToolHistory", () => {
    it("returns paginated results", () => {
      const sessionId = `session-page-${Date.now()}`;
      const agentId = "test-agent-page";

      for (let i = 0; i < 25; i++) {
        recordToolCall({
          sessionId,
          agentId,
          toolName: `tool_${i % 3}`,
          inputTokens: 10,
          outputTokens: 50,
          durationMs: 30,
          status: "success",
          inputSizeBytes: 20,
          outputSizeBytes: 200,
        });
      }

      const page1 = listToolHistory({ sessionId, page: 1, pageSize: 10 });
      const page2 = listToolHistory({ sessionId, page: 2, pageSize: 10 });
      const page3 = listToolHistory({ sessionId, page: 3, pageSize: 10 });

      expect(page1.records).toHaveLength(10);
      expect(page2.records).toHaveLength(10);
      expect(page3.records).toHaveLength(5);
      expect(page1.total).toBe(25);
      expect(page1.totalPages).toBe(3);
    });

    it("filters by tool name", () => {
      const sessionId = `session-filter-${Date.now()}`;
      const agentId = "test-agent-filter";

      recordToolCall({
        sessionId, agentId, toolName: "cpu_metrics",
        inputTokens: 10, outputTokens: 50, durationMs: 30,
        status: "success", inputSizeBytes: 20, outputSizeBytes: 200,
      });
      recordToolCall({
        sessionId, agentId, toolName: "memory_metrics",
        inputTokens: 10, outputTokens: 50, durationMs: 30,
        status: "success", inputSizeBytes: 20, outputSizeBytes: 200,
      });

      const filtered = listToolHistory({ sessionId, toolName: "cpu_metrics" });
      expect(filtered.records.every((r) => r.toolName === "cpu_metrics")).toBe(true);
    });
  });

  describe("resetSessionMetrics", () => {
    it("clears all records for the session", () => {
      const sessionId = `session-reset-${Date.now()}`;
      const agentId = "test-agent-reset";

      recordToolCall({
        sessionId, agentId, toolName: "disk_metrics",
        inputTokens: 5, outputTokens: 120, durationMs: 60,
        status: "success", inputSizeBytes: 10, outputSizeBytes: 600,
      });

      const before = getBurnAnalytics({ sessionId, agentId });
      expect(before.lifetimeTotals.callCount).toBe(1);

      const result = resetSessionMetrics({ sessionId });
      expect(result.deleted).toBe(1);

      const after = getBurnAnalytics({ sessionId, agentId });
      expect(after.lifetimeTotals.callCount).toBe(0);
    });
  });
});
