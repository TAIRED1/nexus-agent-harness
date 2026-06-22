"use client";

import { useState } from "react";
import { useTelemetrySocket } from "@/hooks/useTelemetrySocket";
import { EventStream } from "@/components/ui/EventStream";
import type { TelemetryEventType } from "@/lib/types";

const EVENT_TYPES: TelemetryEventType[] = [
  "tool_call_completed",
  "tool_call_error",
  "shell_command_executed",
  "shell_session_created",
  "shell_session_terminated",
  "system_snapshot_captured",
  "token_burn_threshold_exceeded",
  "agent_connected",
  "agent_disconnected",
];

export default function EventsPage() {
  const { events, clearEvents, status: wsStatus } = useTelemetrySocket();
  const [filters, setFilters] = useState<Set<TelemetryEventType>>(new Set());

  const toggleFilter = (type: TelemetryEventType) => {
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const filtered = filters.size > 0
    ? events.filter((e) => filters.has(e.type))
    : events;

  return (
    <div className="page-enter" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="flex justify-between items-center">
        <div>
          <h1 className="section-heading">
            <span className="icon">⚡</span>
            Event Stream
          </h1>
          <p style={{ color: "var(--color-text-muted)", fontSize: 13, marginTop: 6 }}>
            All live telemetry events from the MCP server
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <span className="topbar-status-pill">
            <span className={`status-dot ${wsStatus}`} />
            {wsStatus}
          </span>
          <button className="btn btn-ghost" onClick={clearEvents}>
            ✕ Clear
          </button>
        </div>
      </div>

      {/* Event type filters */}
      <div className="card" style={{ padding: "12px 16px" }}>
        <div className="card-header" style={{ marginBottom: 10 }}>
          <span className="card-title">Event Type Filters</span>
          {filters.size > 0 && (
            <button
              className="btn btn-ghost"
              style={{ padding: "2px 8px", fontSize: 11 }}
              onClick={() => setFilters(new Set())}
            >
              Clear filters
            </button>
          )}
        </div>
        <div className="flex" style={{ flexWrap: "wrap", gap: 8 }}>
          {EVENT_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => toggleFilter(type)}
              style={{
                padding: "4px 12px",
                borderRadius: "var(--radius-full)",
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                cursor: "pointer",
                border: filters.has(type)
                  ? "1px solid var(--color-accent)"
                  : "1px solid var(--color-border-default)",
                background: filters.has(type)
                  ? "var(--color-accent-dim)"
                  : "transparent",
                color: filters.has(type)
                  ? "var(--color-accent)"
                  : "var(--color-text-muted)",
                transition: "all 0.15s ease",
              }}
            >
              {type.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Full event log */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Events</span>
          <span className="text-xs text-muted">
            {filtered.length}/{events.length} shown
          </span>
        </div>
        <EventStream
          events={filtered}
          maxHeight={600}
          showAgentId
        />
      </div>
    </div>
  );
}
