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

import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage, Server as HttpServer } from "node:http";
import { telemetryBus } from "../utils/telemetry-bus.js";
import { createLogger } from "../utils/logger.js";
import type { TelemetryEvent, TelemetryEventType } from "../types/index.js";

const logger = createLogger("ws-telemetry");

interface ClientState {
  ws: WebSocket;
  subscriptions: Set<TelemetryEventType> | null; // null = all
  connectedAt: number;
}

const clients = new Map<string, ClientState>();
let clientSeq = 0;

function sendFrame(
  ws: WebSocket,
  type: "event" | "hello" | "ack" | "error",
  payload: unknown
): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify({ type, payload }));
  } catch (err) {
    logger.warn({ err }, "Failed to send WebSocket frame");
  }
}

function broadcast(event: TelemetryEvent): void {
  for (const [id, client] of clients) {
    if (client.ws.readyState !== WebSocket.OPEN) {
      clients.delete(id);
      continue;
    }

    // Apply per-client subscription filter
    if (
      client.subscriptions !== null &&
      !client.subscriptions.has(event.type)
    ) {
      continue;
    }

    sendFrame(client.ws, "event", event);
  }
}

export function createTelemetryWebSocketServer(
  httpServer: HttpServer
): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/telemetry" });

  // Subscribe to all events from the bus and fan them out
  telemetryBus.onEvent(broadcast);

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    const clientId = `client-${++clientSeq}`;
    clients.set(clientId, {
      ws,
      subscriptions: null, // subscribe to all by default
      connectedAt: Date.now(),
    });

    logger.info({ clientId, totalClients: clients.size }, "Dashboard client connected");

    // Send buffered events for replay (last 100)
    const buffered = telemetryBus.getBuffer({ limit: 100 });
    sendFrame(ws, "hello", {
      clientId,
      serverTime: new Date().toISOString(),
      bufferedEvents: buffered,
    });

    ws.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString("utf8")) as {
          action?: string;
          subscriptions?: string[];
        };

        if (msg.action === "subscribe" && Array.isArray(msg.subscriptions)) {
          const client = clients.get(clientId);
          if (client) {
            client.subscriptions = new Set(
              msg.subscriptions as TelemetryEventType[]
            );
          }
          sendFrame(ws, "ack", { action: "subscribe", subscriptions: msg.subscriptions });
          logger.debug({ clientId, subscriptions: msg.subscriptions }, "Client updated subscriptions");
        } else if (msg.action === "subscribe_all") {
          const client = clients.get(clientId);
          if (client) {
            client.subscriptions = null;
          }
          sendFrame(ws, "ack", { action: "subscribe_all" });
        }
      } catch {
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

export function getConnectedClientCount(): number {
  return clients.size;
}
