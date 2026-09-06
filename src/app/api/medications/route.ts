import { db } from '@/lib/db'
import { ok, fail, parseBody, rateLimit, clientKey } from '@/lib/api-utils'
import { z } from 'zod'
import { parseSchedule, checkInteractions, predictRefill } from '@/lib/health/meds'

export const dynamic = 'force-dynamic'

const createSchema = z.object({
  name: z.string().min(1).max(80),
  doseValue: z.number().min(0.01).max(5000),
  doseUnit: z.enum(['mg', 'µg', 'ml', 'IU', 'units', 'tablets']).optional(),
  form: z.enum(['tablet', 'capsule', 'injection', 'drops', 'other']).optional(),
  purpose: z.string().max(120).nullable().optional(),
  scheduleTimes: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).min(1).max(6),
  instructions: z.string().max(300).nullable().optional(),
  stock: z.number().min(0).max(10000).nullable().optional(),
  refillThreshold: z.number().min(0).max(1000).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
})

export async function GET() {
  const meds = await db.medication.findMany({ orderBy: { createdAt: 'asc' } })
  const withMeta = meds.map((m) => ({
    ...m,
    scheduleTimes: parseSchedule(m.scheduleTimes),
    refill: predictRefill(m),
  }))
  const interactions = checkInteractions(meds.map((m) => ({ name: m.name })))
  return ok({ medications: withMeta, interactions })
}

export async function POST(req: Request) {
  if (!rateLimit(clientKey(req, 'med-post'), 30, 60_000)) return fail('Too many requests', 429)
  const parsed = await parseBody(req, createSchema)
  if ('response' in parsed) return parsed.response
  const d = parsed.data
  const med = await db.medication.create({
    data: {
      name: d.name,
      doseValue: d.doseValue,
      doseUnit: d.doseUnit ?? 'mg',
      form: d.form ?? 'tablet',
      purpose: d.purpose ?? null,
      scheduleTimes: JSON.stringify(d.scheduleTimes),
      instructions: d.instructions ?? null,
      stock: d.stock ?? null,
      refillThreshold: d.refillThreshold ?? null,
      notes: d.notes ?? null,
    },
  })
  return ok({ medication: { ...med, scheduleTimes: parseSchedule(med.scheduleTimes) } }, { status: 201 })
}
