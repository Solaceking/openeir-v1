import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-utils'
import { z } from 'zod'
import { parseSchedule } from '@/lib/health/meds'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  doseValue: z.number().min(0.01).max(5000).optional(),
  doseUnit: z.enum(['mg', 'µg', 'ml', 'IU', 'units', 'tablets']).optional(),
  form: z.enum(['tablet', 'capsule', 'injection', 'drops', 'other']).optional(),
  purpose: z.string().max(120).nullable().optional(),
  scheduleTimes: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).min(1).max(6).optional(),
  instructions: z.string().max(300).nullable().optional(),
  stock: z.number().min(0).max(10000).nullable().optional(),
  refillThreshold: z.number().min(0).max(1000).nullable().optional(),
  active: z.boolean().optional(),
  notes: z.string().max(500).nullable().optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const parsed = await parseBody(req, patchSchema)
  if ('response' in parsed) return parsed.response
  const d = parsed.data
  const existing = await db.medication.findUnique({ where: { id } })
  if (!existing) return fail('Medication not found', 404)
  const med = await db.medication.update({
    where: { id },
    data: {
      ...(() => { const { scheduleTimes: _st, ...rest } = d; return rest })(),
      ...(d.scheduleTimes !== undefined ? { scheduleTimes: JSON.stringify(d.scheduleTimes) } : {}),
    },
  })
  return ok({ medication: { ...med, scheduleTimes: parseSchedule(med.scheduleTimes) } })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await db.medication.findUnique({ where: { id } })
  if (!existing) return fail('Medication not found', 404)
  await db.medication.delete({ where: { id } })
  return ok({ deleted: id })
}
