"use strict";
/**
 * @file utils/logger.ts
 * @description Structured, levelled logger backed by Pino.
 *
 * Uses JSON output in production and pretty-printed human-readable
 * output in development. Provides child loggers for per-subsystem context.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rootLogger = void 0;
exports.createLogger = createLogger;
const pino_1 = __importDefault(require("pino"));
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
exports.rootLogger = (0, pino_1.default)({
    name: "nexus-mcp",
    level: process.env["LOG_LEVEL"] ?? (isDev ? "debug" : "info"),
    ...(transport ? { transport } : {}),
    serializers: {
        err: pino_1.default.stdSerializers.err,
        req: pino_1.default.stdSerializers.req,
        res: pino_1.default.stdSerializers.res,
    },
    redact: {
        paths: ["*.password", "*.secret", "*.token", "*.apiKey", "*.api_key"],
        censor: "[REDACTED]",
    },
    timestamp: pino_1.default.stdTimeFunctions.isoTime,
});
/**
 * Create a child logger with a named subsystem context.
 */
function createLogger(name, context) {
    return exports.rootLogger.child({ name, ...context });
}
//# sourceMappingURL=logger.js.map