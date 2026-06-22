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
import { z } from "zod";
import type { SystemSnapshot, CpuMetrics, MemoryMetrics, DiskMetrics, NetworkMetrics, ProcessMetrics } from "../types/index.js";
export declare const ProcessListInputSchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodNumber>;
    sortBy: z.ZodDefault<z.ZodEnum<["cpu", "memory", "pid", "name"]>>;
    includeChildren: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    sortBy: "name" | "cpu" | "memory" | "pid";
    includeChildren: boolean;
}, {
    limit?: number | undefined;
    sortBy?: "name" | "cpu" | "memory" | "pid" | undefined;
    includeChildren?: boolean | undefined;
}>;
export declare const CpuMetricsInputSchema: z.ZodObject<{
    includePerCore: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    includePerCore: boolean;
}, {
    includePerCore?: boolean | undefined;
}>;
export declare const DiskMetricsInputSchema: z.ZodObject<{
    minSizeGb: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    minSizeGb: number;
}, {
    minSizeGb?: number | undefined;
}>;
export type ProcessListInput = z.infer<typeof ProcessListInputSchema>;
export type CpuMetricsInput = z.infer<typeof CpuMetricsInputSchema>;
export type DiskMetricsInput = z.infer<typeof DiskMetricsInputSchema>;
export declare function getSystemSnapshot(): Promise<SystemSnapshot>;
export declare function getCpuMetrics(input: CpuMetricsInput): Promise<CpuMetrics>;
export declare function getMemoryMetrics(): Promise<MemoryMetrics>;
export declare function getDiskMetrics(input: DiskMetricsInput): Promise<DiskMetrics[]>;
export declare function getNetworkMetrics(): Promise<NetworkMetrics[]>;
export declare function getProcessList(input: ProcessListInput): Promise<ProcessMetrics[]>;
//# sourceMappingURL=system-monitor.d.ts.map