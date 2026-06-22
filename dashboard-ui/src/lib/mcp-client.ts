/**
 * @file lib/mcp-client.ts
 * Lightweight MCP JSON-RPC 2.0 client for the dashboard.
 * Calls the MCP server's HTTP transport endpoint.
 */

const MCP_SERVER_URL =
  process.env["NEXT_PUBLIC_MCP_SERVER_URL"] ?? "http://localhost:3001";

let requestId = 0;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params: Record<string, unknown>;
}

interface JsonRpcSuccessResponse<T> {
  jsonrpc: "2.0";
  id: string;
  result: {
    content: Array<{ type: "text"; text: string }>;
    isError: boolean;
  };
  error?: never;
}

interface JsonRpcErrorResponse {
  jsonrpc: "2.0";
  id: string;
  error: { code: number; message: string };
  result?: never;
}

type JsonRpcResponse<T> = JsonRpcSuccessResponse<T> | JsonRpcErrorResponse;

export class McpClientError extends Error {
  constructor(
    message: string,
    public readonly code?: number
  ) {
    super(message);
    this.name = "McpClientError";
  }
}

/** Invoke an MCP tool and return the parsed result */
export async function callMcpTool<T>(
  toolName: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  const id = `req-${++requestId}`;
  const body: JsonRpcRequest = {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name: toolName, arguments: args },
  };

  const response = await fetch(`${MCP_SERVER_URL}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new McpClientError(
      `HTTP ${response.status}: ${response.statusText}`,
      response.status
    );
  }

  const json = (await response.json()) as JsonRpcResponse<T>;

  if (json.error) {
    throw new McpClientError(json.error.message, json.error.code);
  }

  if (!json.result) {
    throw new McpClientError("Empty result from MCP server");
  }

  const firstContent = json.result.content[0];
  if (!firstContent || firstContent.type !== "text") {
    throw new McpClientError("Unexpected content type in MCP response");
  }

  return JSON.parse(firstContent.text) as T;
}

/** Check the server health endpoint */
export async function checkServerHealth(): Promise<{
  status: string;
  uptime: number;
}> {
  const response = await fetch(`${MCP_SERVER_URL}/health`, {
    signal: AbortSignal.timeout(5_000),
  });
  return response.json() as Promise<{ status: string; uptime: number }>;
}

/** Fetch the buffered telemetry events via REST fallback */
export async function getTelemetryBuffer(): Promise<{
  events: unknown[];
  count: number;
}> {
  const response = await fetch(`${MCP_SERVER_URL}/api/telemetry/buffer`, {
    signal: AbortSignal.timeout(5_000),
  });
  return response.json() as Promise<{ events: unknown[]; count: number }>;
}
