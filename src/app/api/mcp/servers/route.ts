// OpenEir — MCP client registry: remote servers this instance CONNECTS to.
// GET  list (with tools from last probe) · POST add + probe now.
// Credentials are stored AES-256-GCM encrypted; never returned to the client.

import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-utils'
import { z } from 'zod'
import { encryptSecret } from '@/lib/crypto'
import { mcpProbe } from '@/lib/mcp-client'

export const dynamic = 'force-dynamic'

function safeUrl(u: string): string | null {
  try {
    const parsed = new URL(u)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
    return parsed.toString()
  } catch {
    return null
  }
}

function view(row: {
  id: string; name: string; url: string; headerName: string; enabled: boolean
  status: string; lastError: string | null; toolsJson: string; lastSeenAt: Date | null
}) {
  let tools: Array<{ name: string; description?: string }> = []
  try { tools = JSON.parse(row.toolsJson) as typeof tools } catch { /* ignore */ }
  return {
    id: row.id, name: row.name, url: row.url, headerName: row.headerName,
    enabled: row.enabled, status: row.status, lastError: row.lastError,
    tools, lastSeenAt: row.lastSeenAt,
  }
}

export async function GET() {
  const rows = await db.mcpServer.findMany({ orderBy: { createdAt: 'asc' } })
  return ok({ servers: rows.map(view) })
}

const postSchema = z.object({
  name: z.string().trim().min(1).max(60),
  url: z.string().trim().min(1).max(500),
  headerName: z.string().trim().max(60).default('Authorization'),
  token: z.string().max(2000).optional(),
})

export async function POST(req: Request) {
  const parsed = await parseBody(req, postSchema)
  if ('response' in parsed) return parsed.response
  const { name, headerName, token } = parsed.data
  const url = safeUrl(parsed.data.url)
  if (!url) return fail('That does not look like a valid http(s) URL', 422)

  const headers: Record<string, string> = {}
  if (token) {
    headers[headerName || 'Authorization'] = headerName.toLowerCase() === 'authorization' && !/^bearer /i.test(token) ? `Bearer ${token}` : token
  }
  const probe = await mcpProbe(url, headers)

  const row = await db.mcpServer.create({
    data: {
      name,
      url,
      headerName: headerName || 'Authorization',
      tokenEnc: token ? encryptSecret(token) : null,
      status: probe.ok ? 'ok' : 'error',
      lastError: probe.ok ? null : (probe.error ?? 'probe failed').slice(0, 300),
      toolsJson: JSON.stringify(probe.tools.map((t) => ({ name: t.name, description: t.description }))),
      lastSeenAt: probe.ok ? new Date() : null,
    },
  })
  return ok({
    server: view(row),
    probe: { ok: probe.ok, serverName: probe.serverName, toolCount: probe.tools.length, error: probe.error },
  }, { status: 201 })
}
