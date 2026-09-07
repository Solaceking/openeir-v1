import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody, rateLimit, clientKey } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

const channelSchema = z.object({
  type: z.enum(['phone', 'whatsapp', 'email', 'signal', 'other']),
  value: z.string().min(3).max(120),
  label: z.string().max(40).optional(),
})

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  relationship: z.enum(['family', 'friend', 'carer', 'neighbour', 'other']).optional(),
  isPrimary: z.boolean().optional(),
  channels: z.array(channelSchema).min(1).max(6).optional(),
  notes: z.string().max(500).nullable().optional(),
  active: z.boolean().optional(),
})

function serialize(c: { id: string; name: string; relationship: string; isPrimary: boolean; channels: string; notes: string | null; active: boolean; createdAt: Date }) {
  return { ...c, channels: JSON.parse(c.channels) }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!rateLimit(clientKey(req, 'contacts'), 30, 60_000)) return fail('Too many requests', 429)
  const { id } = await params
  const parsed = await parseBody(req, patchSchema)
  if ('response' in parsed) return parsed.response
  const data = parsed.data

  if (data.isPrimary) {
    await db.emergencyContact.updateMany({ where: { isPrimary: true, NOT: { id } }, data: { isPrimary: false } })
  }
  const existing = await db.emergencyContact.findUnique({ where: { id } })
  if (!existing) return fail('Contact not found', 404)
  const contact = await db.emergencyContact.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.relationship !== undefined ? { relationship: data.relationship } : {}),
      ...(data.isPrimary !== undefined ? { isPrimary: data.isPrimary } : {}),
      ...(data.channels !== undefined ? { channels: JSON.stringify(data.channels) } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
    },
  })
  return ok({ contact: serialize(contact) })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await db.emergencyContact.findUnique({ where: { id } })
  if (!existing) return fail('Contact not found', 404)
  await db.emergencyContact.delete({ where: { id } })
  return Response.json({ ok: true })
}
