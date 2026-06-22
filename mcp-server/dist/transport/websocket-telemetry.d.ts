/**
 * @file transport/websocket-telemetry.ts
 * @description WebSocket server that fans out live telemetry events
 *              to connected dashboard clients.
 *
 * Protocol:
 *   - Clients connect and immediately receive a "hello" message with
 *     the last N buffered events (for late-joiner replay).
 *   - All subsequent events are broadcast in real-time as JSON frames.
 *   - Clients can send a JSON subscription filter to narrow event types.
 *
 * Frame format:
 *   { "type": "event" | "hello" | "ack", "payload": TelemetryEvent | TelemetryEvent[] }
 */
import { WebSocketServer } from "ws";
import type { Server as HttpServer } from "node:http";
export declare function createTelemetryWebSocketServer(httpServer: HttpServer): WebSocketServer;
export declare function getConnectedClientCount(): number;
//# sourceMappingURL=websocket-telemetry.d.ts.map