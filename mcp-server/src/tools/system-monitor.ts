/**
 * @file tools/system-monitor.ts
 * @description System monitoring tools exposed via MCP.
 *
 * Tools:
 *   - system_snapshot   : Full system health snapshot (CPU, memory, disk, network)
 *   - cpu_metrics       : Real-time CPU load breakdown per core
 *   - memory_metrics    : Detailed memory and swap usage
 *   - disk_metrics      : Filesystem usage across all mounted volumes
 *   - network_metrics   : Per-interface network I/O rates
 *   - process_list      : Top N processes by CPU or memory consumption
 */

import si from "systeminformation";
import { z } from "zod";
import type {
  SystemSnapshot,
  CpuMetrics,
  MemoryMetrics,
  DiskMetrics,
  NetworkMetrics,
  ProcessMetrics,
  Timestamp,
} from "../types/index.js";
import { telemetryBus } from "../utils/telemetry-bus.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("system-monitor");

// ─── Input Schemas ─────────────────────────────────────────────────────────

export const ProcessListInputSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("Number of top processes to return (1-50)"),
  sortBy: z
    .enum(["cpu", "memory", "pid", "name"])
    .default("cpu")
    .describe("Sort criteria for process list"),
  includeChildren: z
    .boolean()
    .default(false)
    .describe("Include child processes in output"),
});

export const CpuMetricsInputSchema = z.object({
  includePerCore: z
    .boolean()
    .default(true)
    .describe("Include per-core load breakdown"),
});

export const DiskMetricsInputSchema = z.object({
  minSizeGb: z
    .number()
    .min(0)
    .default(0)
    .describe("Filter out filesystems smaller than this size in GB"),
});

export type ProcessListInput = z.infer<typeof ProcessListInputSchema>;
export type CpuMetricsInput = z.infer<typeof CpuMetricsInputSchema>;
export type DiskMetricsInput = z.infer<typeof DiskMetricsInputSchema>;

// ─── Tool Implementations ──────────────────────────────────────────────────

export async function getSystemSnapshot(): Promise<SystemSnapshot> {
  logger.debug("Capturing system snapshot");

  const [cpuInfo, cpuLoad, mem, fsSize, netStats, processes, osInfo, timeInfo] =
    await Promise.all([
      si.cpu(),
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.networkStats("*"),
      si.processes(),
      si.osInfo(),
      si.time(),
    ]);

  const cpu: CpuMetrics = {
    manufacturer: cpuInfo.manufacturer,
    brand: cpuInfo.brand,
    speed: cpuInfo.speed,
    cores: cpuInfo.cores,
    physicalCores: cpuInfo.physicalCores,
    currentLoad: cpuLoad.currentLoad,
    userLoad: cpuLoad.currentLoadUser,
    systemLoad: cpuLoad.currentLoadSystem,
    idleLoad: cpuLoad.currentLoadIdle,
    perCoreLoad: (cpuLoad.cpus ?? []).map((c) => c.load),
  };

  const memory: MemoryMetrics = {
    total: mem.total,
    free: mem.free,
    used: mem.used,
    active: mem.active,
    available: mem.available,
    usagePercent: (mem.active / mem.total) * 100,
    swapTotal: mem.swaptotal,
    swapUsed: mem.swapused,
    swapFree: mem.swapfree,
  };

  const disks: DiskMetrics[] = fsSize.map((f) => ({
    fs: f.fs,
    type: f.type,
    size: f.size,
    used: f.used,
    available: f.available ?? 0,
    usePercent: f.use,
    mount: f.mount,
  }));

  const network: NetworkMetrics[] = netStats
    .filter((n) => n.iface !== "lo")
    .map((n) => ({
      iface: n.iface,
      rxBytesPerSec: n.rx_sec ?? 0,
      txBytesPerSec: n.tx_sec ?? 0,
      rxDropSec: n.rx_dropped ?? 0,
      txDropSec: n.tx_dropped ?? 0,
    }));

  const allProcs = processes.list ?? [];
  const topProcesses: ProcessMetrics[] = allProcs
    .sort((a, b) => (b.cpu ?? 0) - (a.cpu ?? 0))
    .slice(0, 10)
    .map((p) => ({
      pid: p.pid,
      name: p.name,
      cpu: p.cpu ?? 0,
      mem: p.mem ?? 0,
      command: p.command ?? p.name,
    }));

  const snapshot: SystemSnapshot = {
    capturedAt: Date.now() as Timestamp,
    cpu,
    memory,
    disks,
    network,
    topProcesses,
    loadAverage: [
      cpuLoad.avgLoad ?? 0,
      cpuLoad.avgLoad ?? 0,
      cpuLoad.avgLoad ?? 0,
    ] as [number, number, number],
    uptime: timeInfo.uptime ?? 0,
    platform: osInfo.platform,
    hostname: osInfo.hostname,
    nodeVersion: process.version,
  };

  telemetryBus.publish("system_snapshot_captured", {
    data: {
      cpuLoad: cpu.currentLoad,
      memUsagePercent: memory.usagePercent,
      diskCount: disks.length,
    },
  });

  return snapshot;
}

export async function getCpuMetrics(
  input: CpuMetricsInput
): Promise<CpuMetrics> {
  const [cpuInfo, cpuLoad] = await Promise.all([
    si.cpu(),
    si.currentLoad(),
  ]);

  return {
    manufacturer: cpuInfo.manufacturer,
    brand: cpuInfo.brand,
    speed: cpuInfo.speed,
    cores: cpuInfo.cores,
    physicalCores: cpuInfo.physicalCores,
    currentLoad: cpuLoad.currentLoad,
    userLoad: cpuLoad.currentLoadUser,
    systemLoad: cpuLoad.currentLoadSystem,
    idleLoad: cpuLoad.currentLoadIdle,
    perCoreLoad: input.includePerCore
      ? (cpuLoad.cpus ?? []).map((c) => c.load)
      : [],
  };
}

export async function getMemoryMetrics(): Promise<MemoryMetrics> {
  const mem = await si.mem();
  return {
    total: mem.total,
    free: mem.free,
    used: mem.used,
    active: mem.active,
    available: mem.available,
    usagePercent: (mem.active / mem.total) * 100,
    swapTotal: mem.swaptotal,
    swapUsed: mem.swapused,
    swapFree: mem.swapfree,
  };
}

export async function getDiskMetrics(
  input: DiskMetricsInput
): Promise<DiskMetrics[]> {
  const fsSize = await si.fsSize();
  const minBytes = input.minSizeGb * 1024 * 1024 * 1024;

  return fsSize
    .filter((f) => f.size >= minBytes)
    .map((f) => ({
      fs: f.fs,
      type: f.type,
      size: f.size,
      used: f.used,
      available: f.available ?? 0,
      usePercent: f.use,
      mount: f.mount,
    }));
}

export async function getNetworkMetrics(): Promise<NetworkMetrics[]> {
  const netStats = await si.networkStats("*");
  return netStats
    .filter((n) => n.iface !== "lo")
    .map((n) => ({
      iface: n.iface,
      rxBytesPerSec: n.rx_sec ?? 0,
      txBytesPerSec: n.tx_sec ?? 0,
      rxDropSec: n.rx_dropped ?? 0,
      txDropSec: n.tx_dropped ?? 0,
    }));
}

export async function getProcessList(
  input: ProcessListInput
): Promise<ProcessMetrics[]> {
  const processes = await si.processes();
  const all = processes.list ?? [];

  const sorted = [...all].sort((a, b) => {
    switch (input.sortBy) {
      case "cpu":
        return (b.cpu ?? 0) - (a.cpu ?? 0);
      case "memory":
        return (b.mem ?? 0) - (a.mem ?? 0);
      case "pid":
        return a.pid - b.pid;
      case "name":
        return a.name.localeCompare(b.name);
    }
  });

  return sorted.slice(0, input.limit).map((p) => ({
    pid: p.pid,
    name: p.name,
    cpu: p.cpu ?? 0,
    mem: p.mem ?? 0,
    command: p.command ?? p.name,
  }));
}
