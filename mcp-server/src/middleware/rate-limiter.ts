/**
 * @file middleware/rate-limiter.ts
 * @description Express request rate limiter using rate-limiter-flexible.
 *
 * Provides per-IP rate limiting for the MCP HTTP transport endpoint
 * to protect against runaway agent loops and DoS scenarios.
 */

import type { Request, Response, NextFunction } from "express";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { config } from "../utils/config.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("rate-limiter");

const rateLimiter = new RateLimiterMemory({
  points: config.security.rateLimitRequestsPerMinute,
  duration: 60,
  blockDuration: 30,
});

export async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const ip =
    req.headers["x-forwarded-for"] ??
    req.socket.remoteAddress ??
    "unknown";
  const key = Array.isArray(ip) ? ip[0] : ip;

  try {
    const result = await rateLimiter.consume(key ?? "unknown");
    res.setHeader("X-RateLimit-Limit", config.security.rateLimitRequestsPerMinute);
    res.setHeader("X-RateLimit-Remaining", result.remainingPoints ?? 0);
    res.setHeader(
      "X-RateLimit-Reset",
      new Date(Date.now() + (result.msBeforeNext ?? 0)).toISOString()
    );
    next();
  } catch (_rej) {
    logger.warn({ ip: key }, "Rate limit exceeded");
    res.status(429).json({
      error: "Too Many Requests",
      message: `Rate limit exceeded. Max ${config.security.rateLimitRequestsPerMinute} requests per minute.`,
      retryAfter: 30,
    });
  }
}
