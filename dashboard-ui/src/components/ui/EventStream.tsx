"use client";

import { formatRelativeTime } from "@/lib/utils";
import type { TelemetryEvent, TelemetryEventType } from "@/lib/types";

interface EventStreamProps {
  events: TelemetryEvent[];
  maxHeight?: number;
  filterTypes?: TelemetryEventType[];
  showAgentId?: boolean;
}

function getEventChipClass(type: TelemetryEventType): string {
  return `event-type-chip event-type-${type}`;
}

function formatEventPayload(event: TelemetryEvent): string {
  const p = event.payload;
  switch (event.type) {
    case "tool_call_completed":
      return `${String(p.toolName ?? "?")} · ${String(p.totalTokens ?? 0)} tokens · ${String(p.durationMs ?? 0)}ms`;
    case "tool_call_error":
      return `${String(p.toolName ?? "?")} — ${String(p.error ?? "error")}`;
    case "shell_command_executed":
      return `exit ${String(p.exitCode ?? "?")} · ${String(p.durationMs ?? 0)}ms`;
    case "shell_session_created":
      return `session ${String(p.shellSessionId ?? "").slice(0, 8)}... · ${String(p.shell ?? "")}`;
    case "shell_session_terminated":
      return `${String(p.totalCommands ?? 0)} commands executed`;
    case "system_snapshot_captured":
      return `CPU ${Number(p.cpuLoad ?? 0).toFixed(1)}% · MEM ${Number(p.memUsagePercent ?? 0).toFixed(1)}%`;
    case "token_burn_threshold_exceeded":
      return `$${Number(p.estimatedCostUSD ?? 0).toFixed(4)} / hr`;
    case "agent_connected":
      return String(p.agentId ?? "");
    case "agent_disconnected":
      return String(p.agentId ?? "");
    default:
      return "";
  }
}

export function EventStream({
  events,
  maxHeight = 380,
  filterTypes,
  showAgentId = false,
}: EventStreamProps) {
  const filtered = filterTypes
    ? events.filter((e) => filterTypes.includes(e.type))
    : events;

  if (filtered.length === 0) {
    return (
      <div className="empty-state">
        <div className="icon">⚡</div>
        <div>Waiting for events…</div>
        <div className="text-xs">Events appear here in real-time</div>
      </div>
    );
  }

  return (
    <div
      className="event-log"
      style={{ maxHeight, overflowY: "auto" }}
    >
      {filtered.map((event) => (
        <div key={event.id} className="event-item">
          <div>
            <span className={getEventChipClass(event.type)}>
              {event.type.replace(/_/g, " ")}
            </span>
          </div>
          <div className="flex-col gap-1 overflow-hidden">
            <div
              className="text-sm truncate"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {formatEventPayload(event)}
            </div>
            {showAgentId && event.agentId && (
              <div className="text-xs font-mono text-muted truncate">
                {event.agentId}
              </div>
            )}
          </div>
          <div className="event-time">{formatRelativeTime(event.timestamp)}</div>
        </div>
      ))}
    </div>
  );
}
