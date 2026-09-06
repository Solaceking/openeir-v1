import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-utils'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  value: z.number().min(1).max(40).optional(),
  context: z.enum(['fasting', 'pre_meal', 'post_meal', 'bedtime', 'random']).optional(),
  carbs: z.number().min(0).max(500).nullable().optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
  notes: z.string().max(500).nullable().optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const parsed = await parseBody(req, patchSchema)
  if ('response' in parsed) return parsed.response
  const existing = await db.glucoseReading.findUnique({ where: { id } })
  if (!existing) return fail('Reading not found', 404)
  const reading = await db.glucoseReading.update({
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
  const existing = await db.glucoseReading.findUnique({ where: { id } })
  if (!existing) return fail('Reading not found', 404)
  await db.glucoseReading.delete({ where: { id } })
  return ok({ deleted: id })
}
