// OpenEir — event ingestion (client-side events like MILESTONE_REACHED)
import { ok, fail, parseBody } from '@/lib/api-utils'
import { z } from 'zod'
import { emitEvent, type EventType } from '@/lib/events'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

const CLIENT_EVENTS = ['MILESTONE_REACHED', 'REPORT_VIEWED', 'BROWSING_CONTEXT', 'DOCTOR_VISIT_UPCOMING'] as const

const schema = z.object({
  type: z.enum(CLIENT_EVENTS),
  payload: z.record(z.string(), z.unknown()).optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
})

export async function POST(req: Request) {
  const parsed = await parseBody(req, schema)
  if ('response' in parsed) return parsed.response
  const record = await emitEvent(parsed.data.type as EventType, parsed.data.payload ?? {}, parsed.data.priority ?? 'low')
  if (!record) return fail('Event bus unavailable', 500)
  return ok({ id: record.id }, { status: 202 })
}

export async function GET() {
  const events = await db.eventRecord.findMany({ orderBy: { createdAt: 'desc' }, take: 50 })
  return ok({ events: events.map((e) => ({ ...e, payload: JSON.parse(e.payload) })) })
}
