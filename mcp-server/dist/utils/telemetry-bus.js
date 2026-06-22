"use strict";
/**
 * @file utils/telemetry-bus.ts
 * @description In-process event bus for live telemetry streaming.
 *
 * All subsystems publish events here. The WebSocket transport layer
 * subscribes and fans them out to connected dashboard clients.
 * Uses a bounded ring-buffer to retain recent events for late-joiners.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.telemetryBus = void 0;
const eventemitter3_1 = __importDefault(require("eventemitter3"));
const uuid_1 = require("uuid");
const logger_js_1 = require("./logger.js");
const logger = (0, logger_js_1.createLogger)("telemetry-bus");
const MAX_BUFFER_SIZE = 1_000;
class TelemetryBus extends eventemitter3_1.default {
    buffer = [];
    publish(eventType, payload) {
        const event = {
            id: (0, uuid_1.v4)(),
            type: eventType,
            timestamp: Date.now(),
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
    onEvent(handler) {
        super.on("event", handler);
        return () => super.off("event", handler);
    }
    /** Get buffered events, optionally filtered by type or time range */
    getBuffer(opts) {
        let events = [...this.buffer];
        if (opts?.types && opts.types.length > 0) {
            events = events.filter((e) => opts.types.includes(e.type));
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
    get bufferSize() {
        return this.buffer.length;
    }
}
// Singleton instance shared across all server modules
exports.telemetryBus = new TelemetryBus();
//# sourceMappingURL=telemetry-bus.js.map