/**
 * @file utils/telemetry-bus.ts
 * @description In-process event bus for live telemetry streaming.
 *
 * All subsystems publish events here. The WebSocket transport layer
 * subscribes and fans them out to connected dashboard clients.
 * Uses a bounded ring-buffer to retain recent events for late-joiners.
 */

import EventEmitter from "eventemitter3";
import { v4 as uuidv4 } from "uuid";
import type {
  TelemetryEvent,
  TelemetryEventType,
  SessionId,
  AgentId,
  Timestamp,
} from "../types/index.js";
import { createLogger } from "./logger.js";

const logger = createLogger("telemetry-bus");

const MAX_BUFFER_SIZE = 1_000;

class TelemetryBus extends EventEmitter {
  private readonly buffer: TelemetryEvent[] = [];

  publish<T extends TelemetryEventType>(
    eventType: T,
    payload: {
      sessionId?: SessionId;
      agentId?: AgentId;
      data: Record<string, unknown>;
    }
  ): boolean {
    const event: TelemetryEvent = {
      id: uuidv4(),
      type: eventType,
      timestamp: Date.now() as Timestamp,
      sessionId: payload.sessionId ?? null,
      agentId: payload.agentId ?? null,
      payload: payload.data,
    };

    // Ring buffer — drop oldest when full
    if (this.buffer.length >= MAX_BUFFER_SIZE) {
      this.buffer.shift();
    }
    this.buffer.push(event);

    logger.debug({ eventType, id: event.id }, "Telemetry event emitted");
    return super.emit("event", event);
  }

  /** Subscribe to all telemetry events */
  onEvent(handler: (event: TelemetryEvent) => void): () => void {
    super.on("event", handler);
    return () => super.off("event", handler);
  }

  /** Get buffered events, optionally filtered by type or time range */
  getBuffer(opts?: {
    types?: TelemetryEventType[];
    since?: Timestamp;
    limit?: number;
  }): TelemetryEvent[] {
    let events = [...this.buffer];

    if (opts?.types && opts.types.length > 0) {
      events = events.filter((e) => (opts.types as string[]).includes(e.type));
    }

    if (opts?.since !== undefined) {
      const since = opts.since;
      events = events.filter((e) => e.timestamp >= since);
    }

    if (opts?.limit !== undefined && opts.limit > 0) {
      events = events.slice(-opts.limit);
    }

    return events;
  }

  get bufferSize(): number {
    return this.buffer.length;
  }
}

// Singleton instance shared across all server modules
export const telemetryBus = new TelemetryBus();
