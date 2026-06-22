/**
 * @file utils/telemetry-bus.ts
 * @description In-process event bus for live telemetry streaming.
 *
 * All subsystems publish events here. The WebSocket transport layer
 * subscribes and fans them out to connected dashboard clients.
 * Uses a bounded ring-buffer to retain recent events for late-joiners.
 */
import EventEmitter from "eventemitter3";
import type { TelemetryEvent, TelemetryEventType, SessionId, AgentId, Timestamp } from "../types/index.js";
declare class TelemetryBus extends EventEmitter {
    private readonly buffer;
    publish<T extends TelemetryEventType>(eventType: T, payload: {
        sessionId?: SessionId;
        agentId?: AgentId;
        data: Record<string, unknown>;
    }): boolean;
    /** Subscribe to all telemetry events */
    onEvent(handler: (event: TelemetryEvent) => void): () => void;
    /** Get buffered events, optionally filtered by type or time range */
    getBuffer(opts?: {
        types?: TelemetryEventType[];
        since?: Timestamp;
        limit?: number;
    }): TelemetryEvent[];
    get bufferSize(): number;
}
export declare const telemetryBus: TelemetryBus;
export {};
//# sourceMappingURL=telemetry-bus.d.ts.map