"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiskMetricsInputSchema = exports.CpuMetricsInputSchema = exports.ProcessListInputSchema = void 0;
exports.getSystemSnapshot = getSystemSnapshot;
exports.getCpuMetrics = getCpuMetrics;
exports.getMemoryMetrics = getMemoryMetrics;
exports.getDiskMetrics = getDiskMetrics;
exports.getNetworkMetrics = getNetworkMetrics;
exports.getProcessList = getProcessList;
const systeminformation_1 = __importDefault(require("systeminformation"));
const zod_1 = require("zod");
const telemetry_bus_js_1 = require("../utils/telemetry-bus.js");
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createLogger)("system-monitor");
// ─── Input Schemas ─────────────────────────────────────────────────────────
exports.ProcessListInputSchema = zod_1.z.object({
    limit: zod_1.z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(10)
        .describe("Number of top processes to return (1-50)"),
    sortBy: zod_1.z
        .enum(["cpu", "memory", "pid", "name"])
        .default("cpu")
        .describe("Sort criteria for process list"),
    includeChildren: zod_1.z
        .boolean()
        .default(false)
        .describe("Include child processes in output"),
});
exports.CpuMetricsInputSchema = zod_1.z.object({
    includePerCore: zod_1.z
        .boolean()
        .default(true)
        .describe("Include per-core load breakdown"),
});
exports.DiskMetricsInputSchema = zod_1.z.object({
    minSizeGb: zod_1.z
        .number()
        .min(0)
        .default(0)
        .describe("Filter out filesystems smaller than this size in GB"),
});
// ─── Tool Implementations ──────────────────────────────────────────────────
async function getSystemSnapshot() {
    logger.debug("Capturing system snapshot");
    const [cpuInfo, cpuLoad, mem, fsSize, netStats, processes, osInfo, timeInfo] = await Promise.all([
        systeminformation_1.default.cpu(),
        systeminformation_1.default.currentLoad(),
        systeminformation_1.default.mem(),
        systeminformation_1.default.fsSize(),
        systeminformation_1.default.networkStats("*"),
        systeminformation_1.default.processes(),
        systeminformation_1.default.osInfo(),
        systeminformation_1.default.time(),
    ]);
    const cpu = {
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
    const memory = {
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
    const disks = fsSize.map((f) => ({
        fs: f.fs,
        type: f.type,
        size: f.size,
        used: f.used,
        available: f.available ?? 0,
        usePercent: f.use,
        mount: f.mount,
    }));
    const network = netStats
        .filter((n) => n.iface !== "lo")
        .map((n) => ({
        iface: n.iface,
        rxBytesPerSec: n.rx_sec ?? 0,
        txBytesPerSec: n.tx_sec ?? 0,
        rxDropSec: n.rx_dropped ?? 0,
        txDropSec: n.tx_dropped ?? 0,
    }));
    const allProcs = processes.list ?? [];
    const topProcesses = allProcs
        .sort((a, b) => (b.cpu ?? 0) - (a.cpu ?? 0))
        .slice(0, 10)
        .map((p) => ({
        pid: p.pid,
        name: p.name,
        cpu: p.cpu ?? 0,
        mem: p.mem ?? 0,
        command: p.command ?? p.name,
    }));
    const snapshot = {
        capturedAt: Date.now(),
        cpu,
        memory,
        disks,
        network,
        topProcesses,
        loadAverage: [
            cpuLoad.avgLoad ?? 0,
            cpuLoad.avgLoad ?? 0,
            cpuLoad.avgLoad ?? 0,
        ],
        uptime: timeInfo.uptime ?? 0,
        platform: osInfo.platform,
        hostname: osInfo.hostname,
        nodeVersion: process.version,
    };
    telemetry_bus_js_1.telemetryBus.publish("system_snapshot_captured", {
        data: {
            cpuLoad: cpu.currentLoad,
            memUsagePercent: memory.usagePercent,
            diskCount: disks.length,
        },
    });
    return snapshot;
}
async function getCpuMetrics(input) {
    const [cpuInfo, cpuLoad] = await Promise.all([
        systeminformation_1.default.cpu(),
        systeminformation_1.default.currentLoad(),
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
async function getMemoryMetrics() {
    const mem = await systeminformation_1.default.mem();
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
async function getDiskMetrics(input) {
    const fsSize = await systeminformation_1.default.fsSize();
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
async function getNetworkMetrics() {
    const netStats = await systeminformation_1.default.networkStats("*");
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
async function getProcessList(input) {
    const processes = await systeminformation_1.default.processes();
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
//# sourceMappingURL=system-monitor.js.map