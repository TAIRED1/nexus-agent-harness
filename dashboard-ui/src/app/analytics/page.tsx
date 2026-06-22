"use client";

import { useTelemetrySocket } from "@/hooks/useTelemetrySocket";
import { AnalyticsPanel } from "@/components/panels/AnalyticsPanel";

export default function AnalyticsPage() {
  const { toolCallEvents, lastBurnAlert } = useTelemetrySocket();

  return (
    <div className="page-enter" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 className="section-heading">
          <span className="icon">◈</span>
          Token Analytics
        </h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: 13, marginTop: 6 }}>
          Token burn rates, cost estimates, and tool invocation analytics
        </p>
      </div>
      <AnalyticsPanel
        toolCallEvents={toolCallEvents}
        lastBurnAlert={lastBurnAlert}
      />
    </div>
  );
}
