import { createHash, randomBytes } from 'crypto'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody, rateLimit, clientKey } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

function sha256(v: string) {
  return createHash('sha256').update(v).digest('hex')
}

const inviteSchema = z.object({
  name: z.string().min(1).max(80).default('Companion'),
  contact: z.string().max(120).nullable().optional(),
})

const patchSchema = z.object({
  id: z.string().min(1),
  action: z.enum(['revoke']),
})

function serialize(l: { id: string; name: string; contact: string | null; status: string; scopes: string; alsoEmergency: boolean; invitedAt: Date; activatedAt: Date | null; lastSeenAt: Date | null }) {
  return { ...l, scopes: JSON.parse(l.scopes) }
}

export async function GET() {
  const links = await db.companionLink.findMany({ orderBy: { invitedAt: 'desc' } })
  return ok({ companions: links.map(serialize) })
}

export async function POST(req: Request) {
  if (!rateLimit(clientKey(req, 'companion'), 10, 60_000)) return fail('Too many requests', 429)
  const parsed = await parseBody(req, inviteSchema)
  if ('response' in parsed) return parsed.response
  const data = parsed.data

  const token = randomBytes(20).toString('base64url') // shown ONCE, never stored raw
  const link = await db.companionLink.create({
    data: {
      name: data.name,
      contact: data.contact ?? null,
      tokenHash: sha256(token),
    },
  })
  // The raw token is returned exactly once — the companion needs it to pair.
  return ok({ companion: serialize(link), token, invitePath: `/companion/${token}` })
}

export async function PATCH(req: Request) {
  if (!rateLimit(clientKey(req, 'companion'), 10, 60_000)) return fail('Too many requests', 429)
  const parsed = await parseBody(req, patchSchema)
  if ('response' in parsed) return parsed.response
  const existing = await db.companionLink.findUnique({ where: { id: parsed.data.id } })
  if (!existing) return fail('Companion link not found', 404)
  const link = await db.companionLink.update({ where: { id: parsed.data.id }, data: { status: 'revoked' } })
  return ok({ companion: serialize(link) })
}
