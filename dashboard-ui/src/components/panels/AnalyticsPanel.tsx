"use client";

import { BurnRateChart, ToolDurationChart } from "@/components/charts/Charts";
import { formatCost } from "@/lib/utils";
import type { TelemetryEvent } from "@/lib/types";
import { useState, useEffect, useRef } from "react";

interface BurnDataPoint {
  time: string;
  tokens: number;
  costUSD: number;
}

interface AnalyticsPanelProps {
  toolCallEvents: TelemetryEvent[];
  lastBurnAlert: TelemetryEvent | null;
}

export function AnalyticsPanel({
  toolCallEvents,
  lastBurnAlert,
}: AnalyticsPanelProps) {
  const [burnHistory, setBurnHistory] = useState<BurnDataPoint[]>([]);
  const windowRef = useRef<{ tokens: number; cost: number; count: number }>({
    tokens: 0,
    cost: 0,
    count: 0,
  });

  // Aggregate tool call events into time-bucketed burn history
  useEffect(() => {
    const latest = toolCallEvents[0];
    if (!latest || latest.type !== "tool_call_completed") return;

    const tokens = Number(latest.payload.totalTokens ?? 0);
    const cost = (tokens / 1000) * 0.015; // approx output cost
    windowRef.current.tokens += tokens;
    windowRef.current.cost += cost;
    windowRef.current.count++;

    const point: BurnDataPoint = {
      time: new Date().toLocaleTimeString("en", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      tokens: windowRef.current.tokens,
      costUSD: windowRef.current.cost,
    };

    setBurnHistory((prev) => [...prev, point].slice(-30));
  }, [toolCallEvents]);

  // Aggregate per-tool stats from event history
  const toolStats = new Map<string, { calls: number; totalMs: number }>();
  for (const event of toolCallEvents) {
    if (event.type !== "tool_call_completed") continue;
    const name = String(event.payload.toolName ?? "unknown");
    const ms = Number(event.payload.durationMs ?? 0);
    const existing = toolStats.get(name) ?? { calls: 0, totalMs: 0 };
    toolStats.set(name, {
      calls: existing.calls + 1,
      totalMs: existing.totalMs + ms,
    });
  }

  const toolDurationData = [...toolStats.entries()]
    .map(([name, stats]) => ({
      name,
      avgMs: stats.calls > 0 ? stats.totalMs / stats.calls : 0,
      calls: stats.calls,
    }))
    .sort((a, b) => b.avgMs - a.avgMs)
    .slice(0, 10);

  // Summary stats
  const totalTokens = toolCallEvents
    .filter((e) => e.type === "tool_call_completed")
    .reduce((s, e) => s + Number(e.payload.totalTokens ?? 0), 0);
  const totalCalls = toolCallEvents.filter(
    (e) => e.type === "tool_call_completed"
  ).length;
  const errorCount = toolCallEvents.filter(
    (e) => e.type === "tool_call_error"
  ).length;
  const estimatedCost = (totalTokens / 1000) * 0.015;

  return (
    <>
      {/* Burn Alert Banner */}
      {lastBurnAlert && (
        <div className="alert-banner danger" style={{ marginBottom: 0 }}>
          <span>🔥</span>
          <span>
            <strong>Token burn threshold exceeded</strong> — estimated $
            {Number(lastBurnAlert.payload.estimatedCostUSD ?? 0).toFixed(4)}/hr.
            Consider pausing agent activity.
          </span>
        </div>
      )}

      {/* Summary Stats */}
      <div className="page-grid grid-cols-4">
        <div className="card stat-card card-accent">
          <span className="stat-label">Total Tokens</span>
          <span className="stat-value accent">
            {totalTokens.toLocaleString()}
          </span>
          <span className="stat-sublabel">{totalCalls} tool calls</span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Est. Cost</span>
          <span className="stat-value cyan">{formatCost(estimatedCost)}</span>
          <span className="stat-sublabel">output tokens only</span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Success Rate</span>
          <span className="stat-value emerald">
            {totalCalls > 0
              ? `${(((totalCalls - errorCount) / totalCalls) * 100).toFixed(1)}%`
              : "—"}
          </span>
          <span className="stat-sublabel">{errorCount} errors</span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Unique Tools</span>
          <span className="stat-value">
            {toolStats.size}
          </span>
          <span className="stat-sublabel">called this session</span>
        </div>
      </div>

      {/* Burn Rate Chart */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">◈ Token Burn Rate</span>
          <span className="text-xs" style={{ color: "var(--color-cyan)" }}>
            Cumulative
          </span>
        </div>
        <BurnRateChart data={burnHistory} height={180} />
      </div>

      {/* Tool Duration Chart */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Tool Avg Duration</span>
          <span className="text-xs text-muted">Top 10 by slowest</span>
        </div>
        <ToolDurationChart data={toolDurationData} height={220} />
      </div>

      {/* Per-tool table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Tool Invocation Log</span>
          <span className="text-xs text-muted">{toolCallEvents.length} events</span>
        </div>
        {toolStats.size === 0 ? (
          <div className="empty-state">
            <div className="icon">◈</div>
            <div>No tool calls recorded yet</div>
          </div>
        ) : (
          <table className="nexus-table">
            <thead>
              <tr>
                <th>Tool</th>
                <th>Calls</th>
                <th>Avg Duration</th>
                <th>Total Tokens</th>
              </tr>
            </thead>
            <tbody>
              {[...toolStats.entries()].map(([name, stats]) => {
                const eventsForTool = toolCallEvents.filter(
                  (e) =>
                    e.type === "tool_call_completed" &&
                    e.payload.toolName === name
                );
                const tokenSum = eventsForTool.reduce(
                  (s, e) => s + Number(e.payload.totalTokens ?? 0),
                  0
                );
                return (
                  <tr key={name}>
                    <td className="mono" style={{ color: "var(--color-accent)" }}>
                      {name}
                    </td>
                    <td>{stats.calls}</td>
                    <td className="mono">
                      {stats.calls > 0
                        ? `${(stats.totalMs / stats.calls).toFixed(0)}ms`
                        : "—"}
                    </td>
                    <td style={{ color: "var(--color-cyan)" }}>
                      {tokenSum.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
