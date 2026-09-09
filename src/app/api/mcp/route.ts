// OpenEir — MCP server endpoint (streamable HTTP, JSON-RPC 2.0).
// Lets external MCP clients (Claude Desktop, agents, WebMCP bridges) read
// this household's data through four read-only tools. Authenticated by a
// bearer token minted in Settings → MCP; every tools/call is audit-logged.

import { ok, fail, rateLimit, clientKey } from '@/lib/api-utils'
import { validMcpAccess, MCP_PROTOCOL_VERSION } from '@/lib/mcp-access'
import { MCP_TOOLS, callMcpTool, auditMcpCall } from '@/lib/mcp-tools'

export const dynamic = 'force-dynamic'

export async function GET() {
  // Streamable-HTTP servers MAY offer an SSE stream here; we are a simple
  // request/response server, so point clients at POST.
  return fail('Use POST (MCP streamable HTTP). See docs/MCP.md for the client config.', 405)
}

export async function DELETE() {
  // Session termination — always accept, we are stateless.
  return new Response(null, { status: 200 })
}

export async function POST(req: Request) {
  if (!rateLimit(clientKey(req, 'mcp'), 60, 60_000)) {
    return fail('Too many MCP requests — slow down.', 429)
  }

  const auth = req.headers.get('authorization')
  if (!(await validMcpAccess(auth))) {
    return fail('Invalid or disabled MCP token — enable access in Settings → MCP.', 401)
  }

  let body: { jsonrpc?: string; id?: number | string | null; method?: string; params?: Record<string, unknown> }
  try {
    body = await req.json()
  } catch {
    return fail('Invalid JSON body', 400)
  }

  const rpc = (result: Record<string, unknown>) => ok({ jsonrpc: '2.0', id: body.id ?? null, result })
  const rpcError = (code: number, message: string) =>
    ok({ jsonrpc: '2.0', id: body.id ?? null, error: { code, message } })

  switch (body.method) {
    case 'initialize':
      return rpc({
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'OpenEir', version: '3.5.0' },
        instructions:
          'Read-only access to a self-hosted health companion (blood pressure, glucose, medications). Use get_today_summary for an overview.',
      })

    case 'notifications/initialized':
      // A notification — no response body per JSON-RPC, HTTP 202-style empty 200.
      return new Response(null, { status: 200 })

    case 'tools/list':
      return rpc({ tools: MCP_TOOLS })

    case 'tools/call': {
      const name = typeof body.params?.name === 'string' ? body.params.name : ''
      if (!name) return rpcError(-32602, 'params.name is required')
      const args = (body.params?.arguments as Record<string, unknown> | undefined) ?? {}
      const res = await callMcpTool(name, args)
      void auditMcpCall(name, JSON.stringify(args))
      if (!res.ok) return rpc({ content: [{ type: 'text', text: res.text }], isError: true })
      return rpc({
        content: [{ type: 'text', text: res.text }],
      })
    }

    default:
      return rpcError(-32601, `Method not supported: ${body.method ?? '(none)'}`)
  }
}
