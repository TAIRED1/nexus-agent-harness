"use client";

import { useTelemetrySocket } from "@/hooks/useTelemetrySocket";
import { SystemPanel } from "@/components/panels/SystemPanel";
import type { Metadata } from "next";

export default function SystemPage() {
  const { latestSnapshot } = useTelemetrySocket();

  return (
    <div className="page-enter" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 className="section-heading">
          <span className="icon">⚙</span>
          System Metrics
        </h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: 13, marginTop: 6 }}>
          Real-time CPU, memory, disk, and process monitoring
        </p>
      </div>
      <div className="page-grid grid-cols-2">
        <SystemPanel snapshot={latestSnapshot} />
      </div>
    </div>
  );
}
