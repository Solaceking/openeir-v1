import { createHash, randomBytes } from 'crypto'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody, rateLimit, clientKey } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

const acceptSchema = z.object({ token: z.string().min(10).max(80) })

function sha256(v: string) {
  return createHash('sha256').update(v).digest('hex')
}

/**
 * Companion pairing: exchange the one-time invite token for a long-lived
 * viewer token. The invite dies here; the viewer token is what the
 * companion's device keeps. Consent-based, revocable, audit-logged.
 */
export async function POST(req: Request) {
  if (!rateLimit(clientKey(req, 'companion-accept'), 10, 60_000)) return fail('Too many requests', 429)
  const parsed = await parseBody(req, acceptSchema)
  if ('response' in parsed) return parsed.response

  const link = await db.companionLink.findUnique({ where: { tokenHash: sha256(parsed.data.token) } })
  if (!link || link.status !== 'invited') {
    return fail('This invite is invalid, already used, or was revoked', 404)
  }

  const viewerToken = randomBytes(32).toString('base64url')
  const updated = await db.companionLink.update({
    where: { id: link.id },
    data: { status: 'active', activatedAt: new Date(), viewerHash: sha256(viewerToken) },
  })

  // Auto-add as emergency contact when the user asked for it
  let emergencyAdded = false
  if (updated.alsoEmergency) {
    const dupe = await db.emergencyContact.findFirst({ where: { name: updated.name, active: true } })
    if (!dupe) {
      const emailish = updated.contact?.includes('@')
      await db.emergencyContact.create({
        data: {
          name: updated.name,
          relationship: 'other',
          channels: JSON.stringify(updated.contact
            ? [{ type: emailish ? 'email' : 'phone', value: updated.contact }]
            : []),
          notes: 'Trusted companion — auto-added on pairing',
        },
      })
      emergencyAdded = true
    }
  }

  // The viewer token is returned exactly once — the companion's device keeps it.
  return ok({ viewerToken, companionName: updated.name, userNameFor: 'user', emergencyAdded })
}
