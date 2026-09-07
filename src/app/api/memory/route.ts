// OpenEir — Memory management API.
// GET    → all memories grouped by tier + reflection state + config
// POST   → manually add a memory
// PATCH  → pin/unpin a memory  { id, pinned }  |  update config  { autoReflect }
// DELETE → remove a memory     ?id=

import { db } from '@/lib/db'
import { ok, fail, parseBody, rateLimit, clientKey } from '@/lib/api-utils'
import { storeMemory, type MemoryKind } from '@/lib/memory'
import { getLastReflectionDate } from '@/lib/reflection'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const addSchema = z.object({
  content: z.string().trim().min(4).max(300),
  kind: z.enum(['fact', 'preference', 'person', 'plan', 'health']).default('fact'),
  pinned: z.boolean().default(false),
})

const patchSchema = z.union([
  z.object({ id: z.string().min(1), pinned: z.boolean() }),
  z.object({ autoReflect: z.boolean() }),
])

export async function GET() {
  const [rows, lastReflection, configRow] = await Promise.all([
    db.memoryEntry.findMany({ orderBy: [{ pinned: 'desc' }, { importance: 'desc' }, { updatedAt: 'desc' }] }),
    getLastReflectionDate(),
    db.appSetting.findUnique({ where: { key: 'memory.config' } }),
  ])
  const config = { autoReflect: configRow ? (() => { try { return !!(JSON.parse(configRow.value) as { autoReflect?: boolean }).autoReflect } catch { return true } })() : true }
  const expired = rows.filter((r) => r.expiresAt && r.expiresAt.getTime() < Date.now())
  return ok({
    memories: rows.filter((r) => !expired.some((e) => e.id === r.id)).map((r) => ({
      id: r.id, tier: r.tier, kind: r.kind, content: r.content, pinned: r.pinned,
      importance: r.importance, accessCount: r.accessCount,
      lastAccessedAt: r.lastAccessedAt, expiresAt: r.expiresAt, createdAt: r.createdAt,
    })),
    counts: {
      core: rows.filter((r) => r.tier === 'core' || r.pinned).length,
      semantic: rows.filter((r) => r.tier === 'semantic' && !r.pinned).length,
      episodic: rows.filter((r) => r.tier === 'episodic').length,
    },
    lastReflection,
    config,
  })
}

export async function POST(req: Request) {
  if (!rateLimit(clientKey(req, 'memory-add'), 20, 60_000)) return fail('Too many requests', 429)
  const parsed = await parseBody(req, addSchema)
  if ('response' in parsed) return parsed.response
  const { content, kind, pinned } = parsed.data
  const result = await storeMemory({ content, kind: kind as MemoryKind, importance: pinned ? 0.9 : 0.7, pinned }, undefined)
  return ok({ stored: result.created, deduped: !result.created })
}

export async function PATCH(req: Request) {
  const parsed = await parseBody(req, patchSchema)
  if ('response' in parsed) return parsed.response
  if ('id' in parsed.data) {
    const { id, pinned } = parsed.data
    const row = await db.memoryEntry.update({ where: { id }, data: { pinned, tier: pinned ? 'core' : 'semantic', expiresAt: pinned ? null : undefined } })
    return ok({ id: row.id, pinned: row.pinned })
  }
  await db.appSetting.upsert({
    where: { key: 'memory.config' },
    update: { value: JSON.stringify({ autoReflect: parsed.data.autoReflect }) },
    create: { key: 'memory.config', value: JSON.stringify({ autoReflect: parsed.data.autoReflect }) },
  })
  return ok({ config: { autoReflect: parsed.data.autoReflect } })
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return fail('id required', 422)
  await db.memoryEntry.delete({ where: { id } }).catch(() => {})
  return ok({ deleted: true })
}
