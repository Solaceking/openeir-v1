// OpenEir — Web Push management.
// GET    → VAPID public key + subscription count
// POST   → subscribe this device (upsert by endpoint)
// DELETE → unsubscribe (body/query: endpoint)
// PUT    → send a test notification to all devices

import { db } from '@/lib/db'
import { ok, fail, parseBody, rateLimit, clientKey } from '@/lib/api-utils'
import { z } from 'zod'
import { getPublicKeyForClient, sendPushToAll } from '@/lib/push'

export const dynamic = 'force-dynamic'

const subscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  label: z.string().trim().max(60).optional(),
})

const unsubscribeSchema = z.object({ endpoint: z.string().min(1).max(1000) })

export async function GET() {
  const publicKey = await getPublicKeyForClient()
  const [agg, subs] = await Promise.all([
    db.pushSubscription.aggregate({ _count: { id: true } }),
    db.pushSubscription.findMany({ orderBy: { createdAt: 'asc' } }),
  ])
  const count = agg._count.id
  return ok({
    publicKey,
    count,
    devices: subs.map((s) => ({
      id: s.id, label: s.label, createdAt: s.createdAt,
      lastSuccessAt: s.lastSuccessAt, lastErrorAt: s.lastErrorAt, lastError: s.lastError,
    })),
  })
}

export async function POST(req: Request) {
  if (!rateLimit(clientKey(req, 'push-sub'), 20, 60_000)) return fail('Too many requests', 429)
  const parsed = await parseBody(req, subscribeSchema)
  if ('response' in parsed) return parsed.response
  const { endpoint, keys, label } = parsed.data
  const ua = req.headers.get('user-agent')?.slice(0, 200) ?? null
  const sub = await db.pushSubscription.upsert({
    where: { endpoint },
    update: { p256dh: keys.p256dh, auth: keys.auth, ...(label ? { label } : {}), lastErrorAt: null, lastError: null },
    create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, label: label ?? 'This device', userAgent: ua },
  })
  return ok({ subscribed: true, id: sub.id })
}

export async function DELETE(req: Request) {
  let endpoint: string | null = null
  try {
    const body = await req.json() as { endpoint?: string }
    endpoint = body.endpoint ?? null
  } catch {
    endpoint = new URL(req.url).searchParams.get('endpoint')
  }
  if (!endpoint) return fail('endpoint required', 422)
  await db.pushSubscription.deleteMany({ where: { endpoint } })
  return ok({ unsubscribed: true })
}

export async function PUT(req: Request) {
  if (!rateLimit(clientKey(req, 'push-test'), 5, 60_000)) return fail('Too many requests', 429)
  let label = 'Test'
  try {
    const body = await req.json() as { label?: string }
    if (body.label) label = body.label
  } catch { /* no body is fine */ }
  const result = await sendPushToAll({
    title: 'OpenEir test notification',
    body: label === 'Test'
      ? 'Push is working. Eir can now reach you on this device.'
      : `Hello from ${label} — push is working.`,
    kind: 'test',
    url: '/',
    tag: 'openeir-test',
  })
  return ok(result)
}
