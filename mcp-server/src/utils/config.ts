/**
 * @file utils/config.ts
 * @description Environment-driven configuration loader with validation.
 *
 * All configuration is read from environment variables with sensible defaults.
 * Uses Zod for validation to fail-fast on misconfiguration at startup.
 */

import { z } from "zod";
import type { NexusServerConfig } from "../types/index.js";

const ConfigSchema = z.object({
  // Server
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().default("0.0.0.0"),
  TRANSPORT: z.enum(["stdio", "http", "sse"]).default("http"),

  // Security
  ALLOWED_SHELL_COMMANDS: z
    .string()
    .optional()
    .transform((v) =>
      v ? v.split(",").map((s) => s.trim()).filter(Boolean) : null
    ),
  BLOCKED_SHELL_PATTERNS: z
    .string()
    .default("rm -rf /,:(){ :|:& };:,> /dev/sda,mkfs")
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean)),
  MAX_COMMAND_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  MAX_OUTPUT_BYTES: z.coerce.number().int().positive().default(512_000),
  RATE_LIMIT_RPM: z.coerce.number().int().positive().default(120),

  // Telemetry
  WS_PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  SNAPSHOT_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),
  TELEMETRY_RETENTION_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(3_600_000), // 1 hour

  // Token pricing (defaults to Claude Sonnet pricing)
  INPUT_COST_PER_1K_USD: z.coerce.number().positive().default(0.003),
  OUTPUT_COST_PER_1K_USD: z.coerce.number().positive().default(0.015),
  BURN_ALERT_THRESHOLD_PER_HOUR: z.coerce.number().positive().default(1.0),

  // Shell
  DEFAULT_SHELL: z.string().default(process.env["SHELL"] ?? "/bin/bash"),
  MAX_SHELL_SESSIONS: z.coerce.number().int().positive().default(10),
  SHELL_SESSION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(300_000), // 5 min
  DEFAULT_CWD: z.string().default(process.cwd()),

  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

type RawEnv = z.input<typeof ConfigSchema>;

function loadConfig(): NexusServerConfig {
  const raw = ConfigSchema.safeParse(process.env as Partial<RawEnv>);

  if (!raw.success) {
    const issues = raw.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`[Config] Invalid environment configuration:\n${issues}`);
  }

  const e = raw.data;

  return {
    server: {
      port: e.PORT,
      host: e.HOST,
      transport: e.TRANSPORT,
    },
    security: {
      allowedShellCommands: e.ALLOWED_SHELL_COMMANDS ?? null,
      blockedShellPatterns: e.BLOCKED_SHELL_PATTERNS,
      maxCommandTimeout: e.MAX_COMMAND_TIMEOUT_MS,
      maxOutputBytes: e.MAX_OUTPUT_BYTES,
      rateLimitRequestsPerMinute: e.RATE_LIMIT_RPM,
    },
    telemetry: {
      wsPort: e.WS_PORT,
      snapshotIntervalMs: e.SNAPSHOT_INTERVAL_MS,
      retentionMs: e.TELEMETRY_RETENTION_MS,
    },
    tokens: {
      estimatedInputCostPer1kUSD: e.INPUT_COST_PER_1K_USD,
      estimatedOutputCostPer1kUSD: e.OUTPUT_COST_PER_1K_USD,
      burnAlertThresholdPerHour: e.BURN_ALERT_THRESHOLD_PER_HOUR,
    },
    shell: {
      defaultShell: e.DEFAULT_SHELL,
      maxSessions: e.MAX_SHELL_SESSIONS,
      sessionTimeoutMs: e.SHELL_SESSION_TIMEOUT_MS,
      defaultCwd: e.DEFAULT_CWD,
    },
  };
}

export const config: NexusServerConfig = loadConfig();
