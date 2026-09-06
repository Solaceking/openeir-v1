import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-utils'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  systolic: z.number().int().min(60).max(260).optional(),
  diastolic: z.number().int().min(30).max(180).optional(),
  pulse: z.number().int().min(25).max(250).nullable().optional(),
  label: z.enum(['morning', 'evening', 'pre_med', 'post_med', 'general']).optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
  notes: z.string().max(500).nullable().optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const parsed = await parseBody(req, patchSchema)
  if ('response' in parsed) return parsed.response
  const existing = await db.bpReading.findUnique({ where: { id } })
  if (!existing) return fail('Reading not found', 404)
  const reading = await db.bpReading.update({
    where: { id },
    data: {
      ...(() => { const { tags: t, ...rest } = parsed.data; return rest })(),
      ...(parsed.data.tags !== undefined ? { tags: JSON.stringify(parsed.data.tags) } : {}),
    },
  })
  return ok({ reading })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await db.bpReading.findUnique({ where: { id } })
  if (!existing) return fail('Reading not found', 404)
  await db.bpReading.delete({ where: { id } })
  return ok({ deleted: id })
}
