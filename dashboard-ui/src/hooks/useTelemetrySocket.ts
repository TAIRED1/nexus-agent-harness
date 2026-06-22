"use client";

/**
 * @file hooks/useTelemetrySocket.ts
 * WebSocket hook for live telemetry event streaming from the MCP server.
 * Implements automatic reconnection with exponential backoff.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { TelemetryEvent, TelemetryEventType, WsHelloFrame, SystemSnapshot } from "@/lib/types";

const WS_URL =
  typeof window !== "undefined"
    ? (process.env["NEXT_PUBLIC_WS_URL"] ?? "ws://localhost:3001/ws/telemetry")
    : "ws://localhost:3001/ws/telemetry";

const MAX_EVENTS = 500;
const MAX_RECONNECT_DELAY = 30_000;

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export interface TelemetryState {
  status: ConnectionStatus;
  clientId: string | null;
  events: TelemetryEvent[];
  latestSnapshot: SystemSnapshot | null;
  lastBurnAlert: TelemetryEvent | null;
  shellEvents: TelemetryEvent[];
  toolCallEvents: TelemetryEvent[];
  errorCount: number;
}

interface UseTelemetrySocketReturn extends TelemetryState {
  subscribe: (types: TelemetryEventType[]) => void;
  subscribeAll: () => void;
  clearEvents: () => void;
}

export function useTelemetrySocket(): UseTelemetrySocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state, setState] = useState<TelemetryState>({
    status: "connecting",
    clientId: null,
    events: [],
    latestSnapshot: null,
    lastBurnAlert: null,
    shellEvents: [],
    toolCallEvents: [],
    errorCount: 0,
  });

  const subscribe = useCallback((types: TelemetryEventType[]) => {
    wsRef.current?.send(JSON.stringify({ action: "subscribe", subscriptions: types }));
  }, []);

  const subscribeAll = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ action: "subscribe_all" }));
  }, []);

  const clearEvents = useCallback(() => {
    setState((prev) => ({
      ...prev,
      events: [],
      shellEvents: [],
      toolCallEvents: [],
      errorCount: 0,
    }));
  }, []);

  const processEvent = useCallback((event: TelemetryEvent) => {
    setState((prev) => {
      const newEvents = [event, ...prev.events].slice(0, MAX_EVENTS);

      let latestSnapshot = prev.latestSnapshot;
      let lastBurnAlert = prev.lastBurnAlert;
      let shellEvents = prev.shellEvents;
      let toolCallEvents = prev.toolCallEvents;
      let errorCount = prev.errorCount;

      if (event.type === "system_snapshot_captured") {
        // The payload is partial; we merge with existing
        latestSnapshot = event.payload as unknown as SystemSnapshot;
      }

      if (event.type === "token_burn_threshold_exceeded") {
        lastBurnAlert = event;
      }

      if (
        event.type === "shell_command_executed" ||
        event.type === "shell_session_created" ||
        event.type === "shell_session_terminated"
      ) {
        shellEvents = [event, ...prev.shellEvents].slice(0, 200);
      }

      if (
        event.type === "tool_call_completed" ||
        event.type === "tool_call_started" ||
        event.type === "tool_call_error"
      ) {
        toolCallEvents = [event, ...prev.toolCallEvents].slice(0, 200);
        if (event.type === "tool_call_error") {
          errorCount = prev.errorCount + 1;
        }
      }

      return {
        ...prev,
        events: newEvents,
        latestSnapshot,
        lastBurnAlert,
        shellEvents,
        toolCallEvents,
        errorCount,
      };
    });
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setState((prev) => ({ ...prev, status: "connecting" }));

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptRef.current = 0;
      setState((prev) => ({ ...prev, status: "connected" }));
    };

    ws.onmessage = (evt: MessageEvent<string>) => {
      try {
        const frame = JSON.parse(evt.data) as {
          type: "event" | "hello" | "ack" | "error";
          payload: unknown;
        };

        if (frame.type === "hello") {
          const hello = frame.payload as WsHelloFrame;
          setState((prev) => ({ ...prev, clientId: hello.clientId }));
          // Replay buffered events (oldest first)
          const buffered = [...(hello.bufferedEvents ?? [])].reverse();
          buffered.forEach((e) => processEvent(e));
        } else if (frame.type === "event") {
          processEvent(frame.payload as TelemetryEvent);
        }
      } catch {
        // Ignore malformed frames
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      setState((prev) => ({ ...prev, status: "disconnected" }));

      // Exponential backoff reconnect
      const delay = Math.min(
        1000 * Math.pow(2, reconnectAttemptRef.current),
        MAX_RECONNECT_DELAY
      );
      reconnectAttemptRef.current++;

      reconnectTimerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      setState((prev) => ({ ...prev, status: "error" }));
    };
  }, [processEvent]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

  return { ...state, subscribe, subscribeAll, clearEvents };
}
