/**
 * @file middleware/rate-limiter.ts
 * @description Express request rate limiter using rate-limiter-flexible.
 *
 * Provides per-IP rate limiting for the MCP HTTP transport endpoint
 * to protect against runaway agent loops and DoS scenarios.
 */
import type { Request, Response, NextFunction } from "express";
export declare function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=rate-limiter.d.ts.map