"use strict";
/**
 * @file middleware/rate-limiter.ts
 * @description Express request rate limiter using rate-limiter-flexible.
 *
 * Provides per-IP rate limiting for the MCP HTTP transport endpoint
 * to protect against runaway agent loops and DoS scenarios.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimitMiddleware = rateLimitMiddleware;
const rate_limiter_flexible_1 = require("rate-limiter-flexible");
const config_js_1 = require("../utils/config.js");
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createLogger)("rate-limiter");
const rateLimiter = new rate_limiter_flexible_1.RateLimiterMemory({
    points: config_js_1.config.security.rateLimitRequestsPerMinute,
    duration: 60,
    blockDuration: 30,
});
async function rateLimitMiddleware(req, res, next) {
    const ip = req.headers["x-forwarded-for"] ??
        req.socket.remoteAddress ??
        "unknown";
    const key = Array.isArray(ip) ? ip[0] : ip;
    try {
        const result = await rateLimiter.consume(key ?? "unknown");
        res.setHeader("X-RateLimit-Limit", config_js_1.config.security.rateLimitRequestsPerMinute);
        res.setHeader("X-RateLimit-Remaining", result.remainingPoints ?? 0);
        res.setHeader("X-RateLimit-Reset", new Date(Date.now() + (result.msBeforeNext ?? 0)).toISOString());
        next();
    }
    catch (_rej) {
        logger.warn({ ip: key }, "Rate limit exceeded");
        res.status(429).json({
            error: "Too Many Requests",
            message: `Rate limit exceeded. Max ${config_js_1.config.security.rateLimitRequestsPerMinute} requests per minute.`,
            retryAfter: 30,
        });
    }
}
//# sourceMappingURL=rate-limiter.js.map