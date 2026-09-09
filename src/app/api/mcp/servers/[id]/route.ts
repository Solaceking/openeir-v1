// OpenEir — one remote MCP server: PATCH (enable/disable / re-probe), DELETE.

import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api-utils'
import { decryptSecret } from '@/lib/crypto'
import { mcpProbe } from '@/lib/mcp-client'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

async function headerFor(row: { headerName: string; tokenEnc: string | null }): Promise<Record<string, string>> {
  if (!row.tokenEnc) return {}
  const token = decryptSecret(row.tokenEnc)
  if (!token) return {}
  const name = row.headerName || 'Authorization'
  const value = name.toLowerCase() === 'authorization' && !/^bearer /i.test(token) ? `Bearer ${token}` : token
  return { [name]: value }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const row = await db.mcpServer.findUnique({ where: { id } })
  if (!row) return fail('MCP server not found', 404)

  let body: { enabled?: boolean; probe?: boolean }
  try {
    body = (await req.json()) as typeof body
  } catch {
    body = {}
  }

  const wantProbe = body.probe === true
  const enabled = typeof body.enabled === 'boolean' ? body.enabled : row.enabled

  let status = row.status
  let lastError = row.lastError
  let toolsJson = row.toolsJson
  let lastSeenAt = row.lastSeenAt

  if (wantProbe || (enabled && status === 'untested')) {
    const probe = await mcpProbe(row.url, await headerFor(row))
    status = probe.ok ? 'ok' : 'error'
    lastError = probe.ok ? null : (probe.error ?? 'probe failed').slice(0, 300)
    toolsJson = JSON.stringify(probe.tools.map((t) => ({ name: t.name, description: t.description })))
    lastSeenAt = probe.ok ? new Date() : lastSeenAt
  }

  const updated = await db.mcpServer.update({
    where: { id },
    data: { enabled, status, lastError, toolsJson, lastSeenAt },
  })
  const tools = JSON.parse(updated.toolsJson || '[]') as Array<{ name: string; description?: string }>
  return ok({
    server: {
      id: updated.id, name: updated.name, url: updated.url, headerName: updated.headerName,
      enabled: updated.enabled, status: updated.status, lastError: updated.lastError,
      tools, lastSeenAt: updated.lastSeenAt,
    },
  })
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  try {
    await db.mcpServer.delete({ where: { id } })
  } catch {
    return fail('MCP server not found', 404)
  }
  return ok({ deleted: true })
}
