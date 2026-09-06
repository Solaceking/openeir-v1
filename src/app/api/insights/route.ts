import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api-utils'
import { emitEvent } from '@/lib/events'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const limit = Math.min(100, Number(url.searchParams.get('limit') ?? 30))
  const rows = await db.insight.findMany({
    where: { status: { not: 'dismissed' } },
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  })
  return ok({
    insights: rows.map((r) => ({ ...r, dataJson: r.dataJson ? JSON.parse(r.dataJson) : null })),
  })
}

/** Manual ambient refresh — runs a lightweight pattern check pass. */
export async function POST(req: Request) {
  const record = await emitEvent('PATTERN_CHECK', { source: 'manual' }, 'low')
  if (!record) return fail('Could not schedule check', 500)
  return ok({ queued: record.id }, { status: 202 })
}
