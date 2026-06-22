"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { formatDuration } from "@/lib/utils";

// ── Custom Tooltip ─────────────────────────────────────────────────────────

function CustomTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  formatter?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="custom-tooltip">
      <div className="label">{label}</div>
      {payload.map((entry) => (
        <div key={entry.name} className="flex gap-2 items-center">
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: entry.color, display: "inline-block" }} />
          <span className="value">
            {formatter ? formatter(entry.value) : entry.value.toFixed(2)}
          </span>
          <span style={{ color: "var(--color-text-muted)", fontSize: "10px" }}>{entry.name}</span>
        </div>
      ))}
    </div>
  );
}

// ── Burn Rate Area Chart ───────────────────────────────────────────────────

interface BurnDataPoint {
  time: string;
  tokens: number;
  costUSD: number;
}

interface BurnRateChartProps {
  data: BurnDataPoint[];
  height?: number;
}

export function BurnRateChart({ data, height = 180 }: BurnRateChartProps) {
  if (data.length === 0) {
    return (
      <div className="empty-state" style={{ height }}>
        <div className="icon">◈</div>
        <div>No burn data yet</div>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
        <defs>
          <linearGradient id="gradTokens" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradCost" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis
          dataKey="time"
          tick={{ fill: "var(--color-text-muted)", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "var(--color-text-muted)", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          content={<CustomTooltip />}
        />
        <Area
          type="monotone"
          dataKey="tokens"
          name="Tokens"
          stroke="#6366f1"
          strokeWidth={2}
          fill="url(#gradTokens)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Tool Call Duration Bar Chart ───────────────────────────────────────────

interface ToolDurationDataPoint {
  name: string;
  avgMs: number;
  calls: number;
}

interface ToolDurationChartProps {
  data: ToolDurationDataPoint[];
  height?: number;
}

export function ToolDurationChart({ data, height = 180 }: ToolDurationChartProps) {
  if (data.length === 0) {
    return (
      <div className="empty-state" style={{ height }}>
        <div className="icon">⬡</div>
        <div>No tool data yet</div>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fill: "var(--color-text-muted)", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => formatDuration(v)}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fill: "var(--color-text-secondary)", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={130}
        />
        <Tooltip
          content={<CustomTooltip formatter={(v) => formatDuration(v)} />}
        />
        <Bar
          dataKey="avgMs"
          name="Avg Duration"
          fill="#6366f1"
          radius={[0, 4, 4, 0]}
          style={{ filter: "drop-shadow(0 0 4px rgba(99,102,241,0.4))" }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── CPU Load Area Chart ────────────────────────────────────────────────────

interface CpuDataPoint {
  time: string;
  load: number;
  user: number;
  system: number;
}

interface CpuChartProps {
  data: CpuDataPoint[];
  height?: number;
}

export function CpuLoadChart({ data, height = 140 }: CpuChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -20 }}>
        <defs>
          <linearGradient id="gradLoad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis
          dataKey="time"
          tick={{ fill: "var(--color-text-muted)", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: "var(--color-text-muted)", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `${v}%`}
        />
        <Tooltip
          content={<CustomTooltip formatter={(v) => `${v.toFixed(1)}%`} />}
        />
        <Area
          type="monotone"
          dataKey="load"
          name="Load"
          stroke="#6366f1"
          strokeWidth={2}
          fill="url(#gradLoad)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
