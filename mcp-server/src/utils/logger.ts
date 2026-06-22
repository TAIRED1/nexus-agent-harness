/**
 * @file utils/logger.ts
 * @description Structured, levelled logger backed by Pino.
 *
 * Uses JSON output in production and pretty-printed human-readable
 * output in development. Provides child loggers for per-subsystem context.
 */

import pino, { type Logger } from "pino";

const isDev = process.env["NODE_ENV"] !== "production";

const transport = isDev
  ? {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
        messageFormat: "[{name}] {msg}",
      },
    }
  : undefined;

export const rootLogger: Logger = pino({
  name: "nexus-mcp",
  level: process.env["LOG_LEVEL"] ?? (isDev ? "debug" : "info"),
  ...(transport ? { transport } : {}),
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
  redact: {
    paths: ["*.password", "*.secret", "*.token", "*.apiKey", "*.api_key"],
    censor: "[REDACTED]",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Create a child logger with a named subsystem context.
 */
export function createLogger(name: string, context?: Record<string, unknown>): Logger {
  return rootLogger.child({ name, ...context });
}
