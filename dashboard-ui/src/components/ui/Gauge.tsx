"use client";

import { getHealthColor, clamp } from "@/lib/utils";

interface GaugeRingProps {
  value: number;    // 0–100
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
  color?: string;
}

export function GaugeRing({
  value,
  size = 96,
  strokeWidth = 8,
  label,
  sublabel,
  color,
}: GaugeRingProps) {
  const clamped = clamp(value, 0, 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const resolvedColor = color ?? getHealthColor(clamped);
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div className="gauge-ring-wrap">
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        {/* Track */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="var(--color-bg-overlay)"
          strokeWidth={strokeWidth}
        />
        {/* Fill */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={resolvedColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: "stroke-dashoffset 0.6s ease, stroke 0.4s ease",
            filter: `drop-shadow(0 0 6px ${resolvedColor}55)`,
          }}
        />
        {/* Center text — apply counter-rotation */}
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          style={{
            transform: `rotate(90deg)`,
            transformOrigin: `${cx}px ${cy}px`,
            fontSize: size < 80 ? "14px" : "18px",
            fontWeight: 700,
            fill: "var(--color-text-primary)",
            fontFamily: "var(--font-sans)",
          }}
        >
          {clamped.toFixed(0)}%
        </text>
      </svg>
      {label && <div className="gauge-ring-label">{label}</div>}
      {sublabel && <div className="text-xs text-muted">{sublabel}</div>}
    </div>
  );
}

interface GaugeBarProps {
  value: number;
  label?: string;
  valueLabel?: string;
  color?: string;
}

export function GaugeBar({ value, label, valueLabel, color }: GaugeBarProps) {
  const clamped = clamp(value, 0, 100);
  const resolvedColor = color ?? getHealthColor(clamped);
  const level = clamped < 50 ? "low" : clamped < 75 ? "medium" : "high";

  return (
    <div className="gauge-wrap">
      {(label ?? valueLabel) && (
        <div className="flex justify-between">
          {label && <span className="text-xs text-secondary">{label}</span>}
          {valueLabel && <span className="text-xs" style={{ color: resolvedColor }}>{valueLabel}</span>}
        </div>
      )}
      <div className="gauge-bar">
        <div
          className={`gauge-fill ${level}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
