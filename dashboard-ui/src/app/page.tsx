"use client";

import { useTelemetrySocket } from "@/hooks/useTelemetrySocket";
import { useServerStatus } from "@/hooks/useServerStatus";
import { EventStream } from "@/components/ui/EventStream";
import { GaugeRing } from "@/components/ui/Gauge";
import { formatBytes, formatUptime, formatCost } from "@/lib/utils";

export default function OverviewPage() {
  const { status, isConnected, error } = useServerStatus();
  const {
    status: wsStatus,
    events,
    latestSnapshot,
    toolCallEvents,
    shellEvents,
    errorCount,
    lastBurnAlert,
  } = useTelemetrySocket();

  // Derived stats
  const totalTokens = toolCallEvents
    .filter((e) => e.type === "tool_call_completed")
    .reduce((s, e) => s + Number(e.payload.totalTokens ?? 0), 0);
  const estimatedCost = (totalTokens / 1000) * 0.015;
  const activeSessions = new Set(
    shellEvents
      .filter((e) => e.type === "shell_session_created")
      .map((e) => String(e.payload.shellSessionId))
  ).size;

  return (
    <div className="page-enter" style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Page header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="section-heading">
            <span className="icon">⬡</span>
            Nexus Agent Harness
          </h1>
          <p style={{ color: "var(--color-text-muted)", fontSize: 13, marginTop: 6 }}>
            Real-time monitoring for autonomous LLM agents
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <div className="topbar-status-pill">
            <span className={`status-dot ${wsStatus}`} />
            WebSocket {wsStatus}
          </div>
          <div className="topbar-status-pill">
            <span className={`status-dot ${isConnected ? "connected" : "disconnected"}`} />
            {isConnected ? "MCP Online" : "MCP Offline"}
          </div>
        </div>
      </div>

      {/* Burn Alert */}
      {lastBurnAlert && (
        <div className="alert-banner danger">
          <span style={{ fontSize: 18 }}>🔥</span>
          <div>
            <strong>Token burn threshold exceeded</strong>
            {" — "}${Number(lastBurnAlert.payload.estimatedCostUSD ?? 0).toFixed(4)}/hr
          </div>
        </div>
      )}

      {/* Connection error */}
      {error && !isConnected && (
        <div className="alert-banner warning">
          <span>⚠</span>
          <span>MCP Server unreachable: {error}. Start the server with <code style={{ fontFamily: "var(--font-mono)" }}>npm run dev</code></span>
        </div>
      )}

      {/* KPI row */}
      <div className="page-grid grid-cols-4">
        <div className="card stat-card card-accent">
          <span className="stat-label">Total Tokens</span>
          <span className="stat-value accent">{totalTokens.toLocaleString()}</span>
          <span className="stat-sublabel">{toolCallEvents.filter(e => e.type === "tool_call_completed").length} calls</span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Est. Cost</span>
          <span className="stat-value cyan">{formatCost(estimatedCost)}</span>
          <span className="stat-sublabel">output tokens</span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Shell Sessions</span>
          <span className="stat-value emerald">{activeSessions}</span>
          <span className="stat-sublabel">created this session</span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Errors</span>
          <span className="stat-value rose">{errorCount}</span>
          <span className="stat-sublabel">tool call errors</span>
        </div>
      </div>

      {/* System + Event Stream */}
      <div className="page-grid grid-cols-1-2">
        {/* System gauges */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">⚙ System Health</span>
            {latestSnapshot && (
              <span className="text-xs text-muted">{latestSnapshot.hostname}</span>
            )}
          </div>
          {latestSnapshot ? (
            <div className="flex" style={{ gap: 20, flexWrap: "wrap", justifyContent: "space-around" }}>
              <GaugeRing
                value={latestSnapshot.cpu.currentLoad}
                label="CPU"
                sublabel={`${latestSnapshot.cpu.cores} cores`}
                size={104}
              />
              <GaugeRing
                value={latestSnapshot.memory.usagePercent}
                label="Memory"
                sublabel={formatBytes(latestSnapshot.memory.total)}
                size={104}
              />
              {latestSnapshot.disks[0] && (
                <GaugeRing
                  value={latestSnapshot.disks[0].usePercent}
                  label="Disk"
                  sublabel={latestSnapshot.disks[0].mount}
                  size={104}
                />
              )}
            </div>
          ) : (
            <div className="empty-state">
              <div className="skeleton" style={{ width: 104, height: 104, borderRadius: "50%" }} />
              <p className="text-muted">Waiting for snapshot…</p>
            </div>
          )}

          {/* Server info */}
          {status && (
            <div
              style={{
                marginTop: 20,
                paddingTop: 16,
                borderTop: "1px solid var(--color-border-subtle)",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}
            >
              {[
                ["Uptime", formatUptime(status.uptime)],
                ["Node", status.nodeVersion],
                ["Transport", status.config.transport],
                ["WS Clients", String(status.connectedDashboardClients)],
                ["Buffer", String(status.telemetryBufferSize) + " events"],
                ["Platform", latestSnapshot?.platform ?? "—"],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="text-xs text-muted">{label}</div>
                  <div
                    className="mono text-sm"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {value}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Live event stream */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">⚡ Live Event Stream</span>
            <span className="text-xs text-muted">{events.length} events</span>
          </div>
          <EventStream events={events} maxHeight={380} showAgentId />
        </div>
      </div>

      {/* Network stats */}
      {latestSnapshot && latestSnapshot.network.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Network I/O</span>
          </div>
          <table className="nexus-table">
            <thead>
              <tr>
                <th>Interface</th>
                <th>RX / sec</th>
                <th>TX / sec</th>
              </tr>
            </thead>
            <tbody>
              {latestSnapshot.network.map((n) => (
                <tr key={n.iface}>
                  <td className="mono">{n.iface}</td>
                  <td style={{ color: "var(--color-cyan)" }}>
                    {formatBytes(n.rxBytesPerSec)}/s
                  </td>
                  <td style={{ color: "var(--color-violet)" }}>
                    {formatBytes(n.txBytesPerSec)}/s
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
