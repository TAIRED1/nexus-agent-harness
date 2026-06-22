"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTelemetryWebSocketServer = createTelemetryWebSocketServer;
exports.getConnectedClientCount = getConnectedClientCount;
const ws_1 = require("ws");
const telemetry_bus_js_1 = require("../utils/telemetry-bus.js");
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createLogger)("ws-telemetry");
const clients = new Map();
let clientSeq = 0;
function sendFrame(ws, type, payload) {
    if (ws.readyState !== ws_1.WebSocket.OPEN)
        return;
    try {
        ws.send(JSON.stringify({ type, payload }));
    }
    catch (err) {
        logger.warn({ err }, "Failed to send WebSocket frame");
    }
}
function broadcast(event) {
    for (const [id, client] of clients) {
        if (client.ws.readyState !== ws_1.WebSocket.OPEN) {
            clients.delete(id);
            continue;
        }
        // Apply per-client subscription filter
        if (client.subscriptions !== null &&
            !client.subscriptions.has(event.type)) {
            continue;
        }
        sendFrame(client.ws, "event", event);
    }
}
function createTelemetryWebSocketServer(httpServer) {
    const wss = new ws_1.WebSocketServer({ server: httpServer, path: "/ws/telemetry" });
    // Subscribe to all events from the bus and fan them out
    telemetry_bus_js_1.telemetryBus.onEvent(broadcast);
    wss.on("connection", (ws, _req) => {
        const clientId = `client-${++clientSeq}`;
        clients.set(clientId, {
            ws,
            subscriptions: null, // subscribe to all by default
            connectedAt: Date.now(),
        });
        logger.info({ clientId, totalClients: clients.size }, "Dashboard client connected");
        // Send buffered events for replay (last 100)
        const buffered = telemetry_bus_js_1.telemetryBus.getBuffer({ limit: 100 });
        sendFrame(ws, "hello", {
            clientId,
            serverTime: new Date().toISOString(),
            bufferedEvents: buffered,
        });
        ws.on("message", (raw) => {
            try {
                const msg = JSON.parse(raw.toString("utf8"));
                if (msg.action === "subscribe" && Array.isArray(msg.subscriptions)) {
                    const client = clients.get(clientId);
                    if (client) {
                        client.subscriptions = new Set(msg.subscriptions);
                    }
                    sendFrame(ws, "ack", { action: "subscribe", subscriptions: msg.subscriptions });
                    logger.debug({ clientId, subscriptions: msg.subscriptions }, "Client updated subscriptions");
                }
                else if (msg.action === "subscribe_all") {
                    const client = clients.get(clientId);
                    if (client) {
                        client.subscriptions = null;
                    }
                    sendFrame(ws, "ack", { action: "subscribe_all" });
                }
            }
            catch {
                sendFrame(ws, "error", { message: "Invalid JSON message" });
            }
        });
        ws.on("close", () => {
            clients.delete(clientId);
            logger.info({ clientId, totalClients: clients.size }, "Dashboard client disconnected");
        });
        ws.on("error", (err) => {
            logger.error({ clientId, err }, "WebSocket client error");
            clients.delete(clientId);
        });
    });
    wss.on("error", (err) => {
        logger.error({ err }, "WebSocket server error");
    });
    logger.info("Telemetry WebSocket server initialized at /ws/telemetry");
    return wss;
}
function getConnectedClientCount() {
    return clients.size;
}
//# sourceMappingURL=websocket-telemetry.js.map