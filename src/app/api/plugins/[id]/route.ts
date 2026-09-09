// OpenEir — one installed plugin: PATCH (enable/disable / health ping), DELETE (revoke).

import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const row = await db.plugin.findUnique({ where: { id } })
  if (!row) return fail('Plugin not found', 404)

  let body: { enabled?: boolean; ping?: boolean }
  try {
    body = (await req.json()) as typeof body
  } catch {
    body = {}
  }

  const enabled = typeof body.enabled === 'boolean' ? body.enabled : row.enabled
  let health = row.health
  let lastSeenAt = row.lastSeenAt

  if (body.ping && row.baseUrl) {
    try {
      const res = await fetch(new URL('/health', row.baseUrl).toString(), { signal: AbortSignal.timeout(5000) })
      health = res.ok ? 'healthy' : 'unreachable'
      if (res.ok) lastSeenAt = new Date()
    } catch {
      health = 'unreachable'
    }
  }

  const updated = await db.plugin.update({ where: { id }, data: { enabled, health, lastSeenAt } })
  let scopes: string[] = []
  try { scopes = JSON.parse(updated.scopes) as string[] } catch { /* ignore */ }
  return ok({
    plugin: {
      id: updated.id, name: updated.name, manifestUrl: updated.manifestUrl, version: updated.version,
      description: updated.description, baseUrl: updated.baseUrl, scopes, enabled: updated.enabled,
      health: updated.health, lastSeenAt: updated.lastSeenAt,
    },
  })
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  try {
    await db.plugin.delete({ where: { id } })
  } catch {
    return fail('Plugin not found', 404)
  }
  return ok({ deleted: true })
}
