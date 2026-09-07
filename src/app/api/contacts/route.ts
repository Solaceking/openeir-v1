import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody, rateLimit, clientKey } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

const channelSchema = z.object({
  type: z.enum(['phone', 'whatsapp', 'email', 'signal', 'other']),
  value: z.string().min(3).max(120),
  label: z.string().max(40).optional(),
})

const contactSchema = z.object({
  name: z.string().min(1).max(80),
  relationship: z.enum(['family', 'friend', 'carer', 'neighbour', 'other']).default('family'),
  isPrimary: z.boolean().default(false),
  channels: z.array(channelSchema).min(1).max(6),
  notes: z.string().max(500).nullable().optional(),
})

function serialize(c: { id: string; name: string; relationship: string; isPrimary: boolean; channels: string; notes: string | null; active: boolean; createdAt: Date }) {
  return { ...c, channels: JSON.parse(c.channels) }
}

export async function GET() {
  const rows = await db.emergencyContact.findMany({ where: { active: true }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] })
  return ok({ contacts: rows.map(serialize) })
}

export async function POST(req: Request) {
  if (!rateLimit(clientKey(req, 'contacts'), 30, 60_000)) return fail('Too many requests', 429)
  const parsed = await parseBody(req, contactSchema)
  if ('response' in parsed) return parsed.response
  const data = parsed.data

  // Only one primary: demote others when this one is promoted
  if (data.isPrimary) {
    await db.emergencyContact.updateMany({ where: { isPrimary: true }, data: { isPrimary: false } })
  }
  const contact = await db.emergencyContact.create({
    data: {
      name: data.name,
      relationship: data.relationship,
      isPrimary: data.isPrimary,
      channels: JSON.stringify(data.channels),
      notes: data.notes ?? null,
    },
  })
  return ok({ contact: serialize(contact) })
}
