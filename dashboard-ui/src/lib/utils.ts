/**
 * @file lib/utils.ts
 * Utility functions for the dashboard UI.
 */

/** Format bytes into a human-readable string */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i] ?? "B"}`;
}

/** Format a duration in milliseconds to human-readable */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/** Format uptime seconds to human-readable string */
export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

/** Format USD cost with appropriate precision */
export function formatCost(usd: number): string {
  if (usd < 0.001) return `$${(usd * 1000).toFixed(3)}m`;
  if (usd < 1) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

/** Format a timestamp to a readable relative time */
export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 5000) return "just now";
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

/** Format a percentage with a fixed number of decimal places */
export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/** Clamp a number between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Get a CSS color class name based on a percentage value (for health indicators) */
export function getHealthColor(percent: number): string {
  if (percent < 50) return "var(--color-success)";
  if (percent < 75) return "var(--color-warning)";
  return "var(--color-danger)";
}

/** Get a CSS class for a status badge */
export function getStatusClass(status: string): string {
  switch (status) {
    case "idle": return "badge-idle";
    case "running": return "badge-running";
    case "success": return "badge-success";
    case "error": return "badge-error";
    case "timeout": return "badge-warning";
    case "terminated": return "badge-neutral";
    default: return "badge-neutral";
  }
}
