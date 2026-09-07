import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody, rateLimit, clientKey } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

const checkinSchema = z.object({
  note: z.string().max(200).optional(),
})

/** User-side daily check-in — "I'm OK". Feeds the companion freshness ring. */
export async function POST(req: Request) {
  if (!rateLimit(clientKey(req, 'checkin'), 20, 60_000)) return fail('Too many requests', 429)
  const parsed = await parseBody(req, checkinSchema)
  if ('response' in parsed) return parsed.response

  const now = new Date().toISOString()
  const value = parsed.data.note ? `${now}|${parsed.data.note}` : now
  await db.appSetting.upsert({
    where: { key: 'last_checkin' },
    update: { value },
    create: { key: 'last_checkin', value },
  })
  return ok({ at: now })
}
