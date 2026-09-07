import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody, rateLimit, clientKey } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  status: z.enum(['cancelled', 'resolved']),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!rateLimit(clientKey(req, 'sos'), 20, 60_000)) return fail('Too many requests', 429)
  const { id } = await params
  const parsed = await parseBody(req, patchSchema)
  if ('response' in parsed) return parsed.response
  const existing = await db.emergencyEvent.findUnique({ where: { id } })
  if (!existing) return fail('Event not found', 404)
  const event = await db.emergencyEvent.update({
    where: { id },
    data: { status: parsed.data.status, resolvedAt: new Date() },
  })
  return ok({ id: event.id, status: event.status })
}
