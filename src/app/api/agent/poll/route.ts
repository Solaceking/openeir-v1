// OpenEir — Agent polling endpoint: unprocessed events + compact digest.
import { db } from '@/lib/db'
import { ok } from '@/lib/api-utils'
import { buildHealthContext, type HealthContext } from '@/lib/ai/context'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const withContext = url.searchParams.get('context') === '1'
  const events = await db.eventRecord.findMany({
    where: { processed: false },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  let context: HealthContext | null = null
  if (withContext) {
    context = await buildHealthContext()
  }
  return ok({
    pendingEvents: events.map((e) => ({
      id: e.id, type: e.type, priority: e.priority,
      payload: JSON.parse(e.payload), createdAt: e.createdAt,
    })),
    context,
    pollHint: 'POST processed event ids to /api/agent/poll to acknowledge them.',
  })
}

export async function POST(req: Request) {
  let body: unknown
  try { body = await req.json() } catch { body = null }
  const ids = (body as { ack?: string[] })?.ack
  if (Array.isArray(ids) && ids.length) {
    await db.eventRecord.updateMany({
      where: { id: { in: ids.slice(0, 100) } },
      data: { processed: true },
    })
  }
  return ok({ acked: Array.isArray(ids) ? ids.length : 0 })
}
