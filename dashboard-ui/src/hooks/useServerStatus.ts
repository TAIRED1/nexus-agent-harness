"use client";

/**
 * @file hooks/useServerStatus.ts
 * Polls the MCP server health and status endpoints at a configured interval.
 */

import { useEffect, useState, useCallback } from "react";
import { callMcpTool, checkServerHealth } from "@/lib/mcp-client";
import type { ServerStatus } from "@/lib/types";

interface UseServerStatusReturn {
  status: ServerStatus | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useServerStatus(intervalMs = 5000): UseServerStatusReturn {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      // First check health endpoint
      await checkServerHealth();

      // Then get full status via MCP tool
      const serverStatus = await callMcpTool<ServerStatus>("server_status");
      setStatus(serverStatus);
      setIsConnected(true);
      setError(null);
    } catch (err) {
      setIsConnected(false);
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(fetchStatus, intervalMs);
    return () => clearInterval(timer);
  }, [fetchStatus, intervalMs]);

  return { status, isConnected, isLoading, error, refetch: fetchStatus };
}
