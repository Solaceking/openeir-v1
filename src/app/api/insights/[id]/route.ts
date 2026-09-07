import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-utils'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  status: z.enum(['new', 'seen', 'dismissed', 'actioned']).optional(),
  pinned: z.boolean().optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const parsed = await parseBody(req, patchSchema)
  if ('response' in parsed) return parsed.response
  const existing = await db.insight.findUnique({ where: { id } })
  if (!existing) return fail('Insight not found', 404)
  const insight = await db.insight.update({ where: { id }, data: parsed.data })
  return ok({ insight })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await db.insight.findUnique({ where: { id } })
  if (!existing) return fail('Insight not found', 404)
  await db.insight.delete({ where: { id } })
  return ok({ deleted: id })
}
