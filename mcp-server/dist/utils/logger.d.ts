/**
 * @file utils/logger.ts
 * @description Structured, levelled logger backed by Pino.
 *
 * Uses JSON output in production and pretty-printed human-readable
 * output in development. Provides child loggers for per-subsystem context.
 */
import { type Logger } from "pino";
export declare const rootLogger: Logger;
/**
 * Create a child logger with a named subsystem context.
 */
export declare function createLogger(name: string, context?: Record<string, unknown>): Logger;
//# sourceMappingURL=logger.d.ts.map