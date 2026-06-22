"use client";

import { GaugeRing, GaugeBar } from "@/components/ui/Gauge";
import { CpuLoadChart } from "@/components/charts/Charts";
import { formatBytes, formatPercent } from "@/lib/utils";
import type { SystemSnapshot } from "@/lib/types";
import { useState, useEffect, useRef } from "react";

interface SystemPanelProps {
  snapshot: SystemSnapshot | null;
}

interface CpuHistoryPoint {
  time: string;
  load: number;
  user: number;
  system: number;
}

export function SystemPanel({ snapshot }: SystemPanelProps) {
  const [cpuHistory, setCpuHistory] = useState<CpuHistoryPoint[]>([]);
  const historyRef = useRef<CpuHistoryPoint[]>([]);

  useEffect(() => {
    if (!snapshot) return;
    const point: CpuHistoryPoint = {
      time: new Date().toLocaleTimeString("en", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      load: snapshot.cpu.currentLoad,
      user: snapshot.cpu.userLoad,
      system: snapshot.cpu.systemLoad,
    };
    historyRef.current = [...historyRef.current, point].slice(-30);
    setCpuHistory([...historyRef.current]);
  }, [snapshot]);

  if (!snapshot) {
    return (
      <div className="card" style={{ minHeight: 200 }}>
        <div className="card-header">
          <span className="card-title">System Health</span>
        </div>
        <div className="empty-state">
          <div className="skeleton" style={{ width: 96, height: 96, borderRadius: "50%" }} />
          <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
            Waiting for MCP server…
          </div>
        </div>
      </div>
    );
  }

  const cpu = snapshot.cpu;
  const mem = snapshot.memory;
  const topDisk = snapshot.disks[0];

  return (
    <>
      {/* CPU + Memory Gauges */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">⚙ System Health</span>
          <span
            className="text-xs font-mono"
            style={{ color: "var(--color-text-muted)" }}
          >
            {snapshot.hostname}
          </span>
        </div>
        <div
          className="flex justify-between"
          style={{ flexWrap: "wrap", gap: 16 }}
        >
          <GaugeRing
            value={cpu.currentLoad}
            label="CPU"
            sublabel={`${cpu.cores} cores · ${cpu.brand}`}
            size={110}
          />
          <GaugeRing
            value={mem.usagePercent}
            label="Memory"
            sublabel={`${formatBytes(mem.used)} / ${formatBytes(mem.total)}`}
            size={110}
          />
          {topDisk && (
            <GaugeRing
              value={topDisk.usePercent}
              label="Disk"
              sublabel={`${formatBytes(topDisk.used)} / ${formatBytes(topDisk.size)}`}
              size={110}
            />
          )}
        </div>

        {/* CPU Core Bars */}
        {cpu.perCoreLoad.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div className="text-xs text-muted mb-4" style={{ marginBottom: 8 }}>
              Per-core load
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${Math.min(cpu.perCoreLoad.length, 8)}, 1fr)`,
                gap: 6,
              }}
            >
              {cpu.perCoreLoad.slice(0, 16).map((load, i) => (
                <GaugeBar
                  key={i}
                  value={load}
                  label={`C${i}`}
                  valueLabel={`${load.toFixed(0)}%`}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* CPU History Chart */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">CPU Load History</span>
          <span
            className="text-xs"
            style={{ color: "var(--color-accent)" }}
          >
            {formatPercent(cpu.currentLoad)} now
          </span>
        </div>
        <CpuLoadChart data={cpuHistory} height={150} />
      </div>

      {/* Memory breakdown */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Memory Breakdown</span>
          <span className="text-xs text-muted">{formatBytes(mem.total)} total</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <GaugeBar
            value={(mem.active / mem.total) * 100}
            label="Active"
            valueLabel={formatBytes(mem.active)}
          />
          <GaugeBar
            value={(mem.used / mem.total) * 100}
            label="Used"
            valueLabel={formatBytes(mem.used)}
          />
          <GaugeBar
            value={(mem.swapUsed / Math.max(mem.swapTotal, 1)) * 100}
            label="Swap"
            valueLabel={`${formatBytes(mem.swapUsed)} / ${formatBytes(mem.swapTotal)}`}
          />
        </div>
      </div>

      {/* Top Processes */}
      <div className="card" style={{ gridColumn: "1 / -1" }}>
        <div className="card-header">
          <span className="card-title">Top Processes</span>
        </div>
        <table className="nexus-table">
          <thead>
            <tr>
              <th>PID</th>
              <th>Name</th>
              <th>CPU%</th>
              <th>MEM%</th>
              <th>Command</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.topProcesses.map((proc) => (
              <tr key={proc.pid}>
                <td className="mono">{proc.pid}</td>
                <td style={{ fontWeight: 500 }}>{proc.name}</td>
                <td>
                  <span
                    style={{
                      color:
                        proc.cpu > 50
                          ? "var(--color-rose)"
                          : proc.cpu > 20
                          ? "var(--color-amber)"
                          : "var(--color-emerald)",
                    }}
                  >
                    {proc.cpu.toFixed(1)}%
                  </span>
                </td>
                <td>{proc.mem.toFixed(1)}%</td>
                <td className="mono text-sm truncate" style={{ maxWidth: 300 }}>
                  {proc.command}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
