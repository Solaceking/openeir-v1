import { createHash } from 'crypto'
import { db } from '@/lib/db'
import { ok, fail, rateLimit } from '@/lib/api-utils'
import { publishRealtime } from '@/lib/events'

export const dynamic = 'force-dynamic'

function sha256(v: string) {
  return createHash('sha256').update(v).digest('hex')
}

/**
 * Companion nudge — a gentle "thinking of you / are you there" ping.
 * Lands as a live toast on the user's app via the realtime service and
 * stays in the event audit trail.
 */
export async function POST(req: Request) {
  if (!rateLimit(req.headers.get('x-forwarded-for') ?? 'nudge', 10, 60_000)) return fail('Too many requests', 429)
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return fail('Not paired', 401)

  const link = await db.companionLink.findUnique({ where: { viewerHash: sha256(token) } })
  if (!link || link.status !== 'active') return fail('Access revoked or invalid', 403)

  await db.eventRecord.create({
    data: { type: 'COMPANION_NUDGE', priority: 'normal', payload: JSON.stringify({ companionId: link.id, name: link.name }) },
  })
  publishRealtime('insight:new', {
    title: `${link.name} is checking on you`,
    body: 'Your companion tapped "Nudge". Say hello — or tap "I\'m OK" on the Safety page so they know you\'re fine.',
    severity: 'info',
    origin: 'companion',
  })
  return ok({ nudged: true })
}
