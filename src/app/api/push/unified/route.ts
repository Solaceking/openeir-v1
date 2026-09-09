// OpenEir — native push targets (Android app via UnifiedPush / ntfy).
// The endpoint URL comes from the user's distributor app (usually ntfy) —
// OpenEir never talks to a push broker itself, it just POSTs the same JSON
// payload it sends to web-push subscriptions. Fully self-hostable chain.
import { ok, fail, parseBody } from '@/lib/api-utils'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const MAX_TARGETS = 8

const bodySchema = z.object({
  endpoint: z.string().url().max(500).refine((u) => /^https?:\/\//i.test(u), 'Must be an http(s) URL'),
  label: z.string().max(60).optional(),
  appId: z.string().max(120).optional(),
})

export async function GET() {
  const session = await getSession()
  if (!session) return fail('Sign in required', 401)
  const targets = await db.unifiedPushTarget.findMany({ orderBy: { createdAt: 'desc' } })
  return ok({ targets })
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return fail('Sign in required', 401)
  const parsed = await parseBody(req, bodySchema)
  if ('response' in parsed) return parsed.response
  const { endpoint, label, appId } = parsed.data

  const count = await db.unifiedPushTarget.count()
  if (count >= MAX_TARGETS) return fail(`Push target limit reached (${MAX_TARGETS}) — remove one first`, 409)

  const target = await db.unifiedPushTarget.upsert({
    where: { endpoint },
    create: { endpoint, label: label ?? 'Android device', appId: appId ?? 'app.openeir.client' },
    update: { label: label ?? 'Android device', appId: appId ?? 'app.openeir.client', lastError: null },
  })
  return ok({ target })
}

export async function DELETE(req: Request) {
  const session = await getSession()
  if (!session) return fail('Sign in required', 401)
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return fail('Missing id', 400)
  await db.unifiedPushTarget.delete({ where: { id } }).catch(() => {})
  return ok({ removed: true })
}
