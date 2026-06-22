"use client";

import { getStatusClass, formatRelativeTime, formatDuration } from "@/lib/utils";
import type { TelemetryEvent } from "@/lib/types";

interface ShellPanelProps {
  shellEvents: TelemetryEvent[];
}

interface SessionSummary {
  id: string;
  agentId: string;
  createdAt: number;
  lastActivity: number;
  status: string;
  totalCommands: number;
  commands: Array<{
    commandId: string;
    command: string;
    exitCode: number;
    durationMs: number;
    timedOut: boolean;
  }>;
}

export function ShellPanel({ shellEvents }: ShellPanelProps) {
  // Reconstruct session summaries from events
  const sessions = new Map<string, SessionSummary>();

  for (const event of [...shellEvents].reverse()) {
    if (event.type === "shell_session_created") {
      const id = String(event.payload.shellSessionId ?? "unknown");
      if (!sessions.has(id)) {
        sessions.set(id, {
          id,
          agentId: event.agentId ?? "unknown",
          createdAt: event.timestamp,
          lastActivity: event.timestamp,
          status: "idle",
          totalCommands: 0,
          commands: [],
        });
      }
    }

    if (event.type === "shell_session_terminated") {
      const id = String(event.payload.shellSessionId ?? "");
      const s = sessions.get(id);
      if (s) {
        s.status = "terminated";
        s.totalCommands = Number(event.payload.totalCommands ?? s.totalCommands);
      }
    }

    if (event.type === "shell_command_executed") {
      const id = String(event.payload.shellSessionId ?? "");
      const s = sessions.get(id);
      if (s) {
        s.lastActivity = event.timestamp;
        s.status = "idle";
        s.totalCommands++;
        s.commands.unshift({
          commandId: String(event.payload.commandId ?? ""),
          command: String(event.payload.command ?? ""),
          exitCode: Number(event.payload.exitCode ?? 0),
          durationMs: Number(event.payload.durationMs ?? 0),
          timedOut: Boolean(event.payload.timedOut),
        });
      }
    }
  }

  const sessionList = [...sessions.values()].sort(
    (a, b) => b.lastActivity - a.lastActivity
  );

  if (sessionList.length === 0) {
    return (
      <div className="card">
        <div className="card-header">
          <span className="card-title">⌨ Shell Sessions</span>
        </div>
        <div className="empty-state">
          <div className="icon">⌨</div>
          <div>No shell sessions yet</div>
          <div className="text-xs">
            Agents create sessions via <code style={{ fontFamily: "var(--font-mono)" }}>create_shell_session</code>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          <span className="card-title">⌨ Shell Sessions</span>
          <span className="text-xs text-muted">{sessionList.length} sessions</span>
        </div>
        <table className="nexus-table">
          <thead>
            <tr>
              <th>Session ID</th>
              <th>Agent</th>
              <th>Status</th>
              <th>Commands</th>
              <th>Last Activity</th>
            </tr>
          </thead>
          <tbody>
            {sessionList.map((s) => (
              <tr key={s.id}>
                <td className="mono text-sm" style={{ color: "var(--color-cyan)" }}>
                  {s.id.slice(0, 12)}…
                </td>
                <td className="mono text-sm">{s.agentId}</td>
                <td>
                  <span className={`badge ${getStatusClass(s.status)}`}>
                    {s.status}
                  </span>
                </td>
                <td style={{ color: "var(--color-text-secondary)" }}>
                  {s.totalCommands}
                </td>
                <td className="text-sm text-muted">
                  {formatRelativeTime(s.lastActivity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Command history for each session */}
      {sessionList
        .filter((s) => s.commands.length > 0)
        .map((session) => (
          <div key={`cmds-${session.id}`} className="card">
            <div className="card-header">
              <span className="card-title">
                Commands — {session.id.slice(0, 12)}…
              </span>
              <span className={`badge ${getStatusClass(session.status)}`}>
                {session.status}
              </span>
            </div>
            <div className="event-log" style={{ maxHeight: 320 }}>
              {session.commands.map((cmd, idx) => (
                <div key={`${cmd.commandId}-${idx}`} className="event-item">
                  <div
                    className="mono text-sm"
                    style={{
                      color:
                        cmd.exitCode === 0
                          ? "var(--color-emerald)"
                          : cmd.timedOut
                          ? "var(--color-amber)"
                          : "var(--color-rose)",
                      fontSize: "11px",
                      padding: "2px 6px",
                      background: "var(--color-bg-overlay)",
                      borderRadius: 4,
                      flexShrink: 0,
                    }}
                  >
                    {cmd.exitCode === 0 ? "✓" : cmd.timedOut ? "⏱" : "✗"}{" "}
                    {cmd.exitCode}
                  </div>
                  <div className="code-block flex-col gap-1" style={{ padding: "4px 8px", flexGrow: 1 }}>
                    {cmd.command}
                  </div>
                  <div
                    className="mono text-xs text-muted"
                    style={{ flexShrink: 0 }}
                  >
                    {formatDuration(cmd.durationMs)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
    </>
  );
}
