"use client";

import { useServerStatus } from "@/hooks/useServerStatus";
import { useTelemetrySocket } from "@/hooks/useTelemetrySocket";
import { formatUptime } from "@/lib/utils";

interface TopbarProps {
  title?: string;
}

export function Topbar({ title = "Overview" }: TopbarProps) {
  const { status, isConnected } = useServerStatus(10000);
  const { status: wsStatus } = useTelemetrySocket();

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-breadcrumb">{title}</span>
      </div>
      <div className="topbar-right">
        {/* WebSocket status */}
        <div className="topbar-status-pill">
          <span className={`status-dot ${wsStatus}`} />
          WS {wsStatus}
        </div>

        {/* Server uptime */}
        {status && (
          <div className="topbar-status-pill">
            <span style={{ color: "var(--color-text-muted)" }}>↑</span>
            {formatUptime(status.uptime)}
          </div>
        )}

        {/* Server connection */}
        <div className="topbar-status-pill">
          <span
            className={`status-dot ${isConnected ? "connected" : "disconnected"}`}
          />
          {isConnected ? "MCP Online" : "MCP Offline"}
        </div>
      </div>
    </header>
  );
}
