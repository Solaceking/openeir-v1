// OpenEir — minimal MCP client for REMOTE servers (streamable HTTP).
// v1 scope: HTTPS/HTTP endpoints only — never spawning local processes.
// Speaks JSON-RPC 2.0 with the MCP handshake and tolerates both plain-JSON
// and SSE-framed responses (many real servers answer with text/event-stream).

export interface McpToolInfo {
  name: string
  description?: string
  inputSchema?: unknown
}

export interface McpProbeResult {
  ok: boolean
  serverName?: string
  serverVersion?: string
  tools: McpToolInfo[]
  error?: string
}

const PROTOCOL_VERSION = '2025-03-26'
const TIMEOUT_MS = 10_000

interface JsonRpcResponse {
  jsonrpc?: string
  id?: number | string | null
  result?: Record<string, unknown>
  error?: { code: number; message: string }
}

/** POST one JSON-RPC message; returns the first result object (JSON or SSE-framed). */
async function rpcCall(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  sessionId?: string | null,
): Promise<{ result: JsonRpcResponse; sessionId: string | null }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) {
    const text = (await res.text().catch(() => '')).slice(0, 200)
    throw new Error(`HTTP ${res.status}${text ? `: ${text}` : ''}`)
  }
  const newSession = res.headers.get('mcp-session-id')
  const ctype = res.headers.get('content-type') ?? ''
  let payload: JsonRpcResponse | null = null
  if (ctype.includes('text/event-stream')) {
    // Concatenate data: lines until a JSON-RPC result/error for our protocol flow arrives
    const reader = res.body?.getReader()
    if (reader) {
      const decoder = new TextDecoder()
      let buf = ''
      const deadline = Date.now() + TIMEOUT_MS
      while (Date.now() < deadline) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        for (const line of buf.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          try {
            const parsed = JSON.parse(trimmed.slice(5).trim()) as JsonRpcResponse
            if (parsed.result || parsed.error) { payload = parsed; break }
          } catch { /* partial frame — keep reading */ }
        }
        if (payload) break
      }
      try { await reader.cancel() } catch { /* stream already closed */ }
    }
    if (!payload) throw new Error('server sent no JSON-RPC result in its SSE stream')
  } else {
    payload = (await res.json()) as JsonRpcResponse
  }
  if (payload?.error) throw new Error(payload.error.message || `JSON-RPC error ${payload.error.code}`)
  if (!payload?.result) throw new Error('server returned an empty JSON-RPC result')
  return { result: payload, sessionId: newSession }
}

/**
 * Handshake + tool discovery for one remote MCP server.
 * initialize → notifications/initialized → tools/list
 */
export async function mcpProbe(url: string, headers: Record<string, string> = {}): Promise<McpProbeResult> {
  try {
    const init = await rpcCall(url, headers, {
      jsonrpc: '2.0', id: 1,
      method: 'initialize',
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'OpenEir', version: '3.5.0' },
      },
    })
    const info = (init.result.result as { serverInfo?: { name?: string; version?: string } }).serverInfo
    // notifications carry no id and get no response — fire and forget
    void rpcCall(url, headers, { jsonrpc: '2.0', method: 'notifications/initialized' }, init.sessionId).catch(() => {})
    const list = await rpcCall(url, headers, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, init.sessionId)
    const tools = (list.result.result as { tools?: McpToolInfo[] }).tools ?? []
    return {
      ok: true,
      serverName: info?.name,
      serverVersion: info?.version,
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    }
  } catch (err) {
    return { ok: false, tools: [], error: err instanceof Error ? err.message : String(err) }
  }
}

/** Call one tool on a remote MCP server (used by the future chat integration). */
export async function mcpCallTool(
  url: string,
  toolName: string,
  args: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<{ ok: boolean; text?: string; error?: string }> {
  try {
    const init = await rpcCall(url, headers, {
      jsonrpc: '2.0', id: 1,
      method: 'initialize',
      params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'OpenEir', version: '3.5.0' } },
    })
    const call = await rpcCall(url, headers, {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: toolName, arguments: args },
    }, init.sessionId)
    const content = (call.result.result as { content?: Array<{ type: string; text?: string }> }).content
    const text = (content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n')
    return { ok: true, text }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
