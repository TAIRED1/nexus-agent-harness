"use client";

import { useTelemetrySocket } from "@/hooks/useTelemetrySocket";
import { ShellPanel } from "@/components/panels/ShellPanel";

export default function ShellPage() {
  const { shellEvents } = useTelemetrySocket();

  return (
    <div className="page-enter" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 className="section-heading">
          <span className="icon">⌨</span>
          Shell Sessions
        </h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: 13, marginTop: 6 }}>
          Isolated shell session monitoring and command execution history
        </p>
      </div>
      <ShellPanel shellEvents={shellEvents} />
    </div>
  );
}
