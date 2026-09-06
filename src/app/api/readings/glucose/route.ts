import { db } from '@/lib/db'
import { ok, fail, parseBody, rateLimit, clientKey } from '@/lib/api-utils'
import { z } from 'zod'
import { emitEvent } from '@/lib/events'

export const dynamic = 'force-dynamic'

const createSchema = z.object({
  value: z.number().min(1).max(40), // canonical mmol/L
  context: z.enum(['fasting', 'pre_meal', 'post_meal', 'bedtime', 'random']).optional(),
  carbs: z.number().min(0).max(500).nullable().optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
  notes: z.string().max(500).nullable().optional(),
  takenAt: z.string().datetime().optional(),
  source: z.enum(['manual', 'bluetooth', 'import']).optional(),
})

export async function GET(req: Request) {
  const url = new URL(req.url)
  const days = Math.min(365, Number(url.searchParams.get('days') ?? 90))
  const since = new Date()
  since.setDate(since.getDate() - days)
  const rows = await db.glucoseReading.findMany({
    where: { takenAt: { gte: since } },
    orderBy: { takenAt: 'desc' },
    take: 2000,
  })
  return ok({ readings: rows })
}

export async function POST(req: Request) {
  if (!rateLimit(clientKey(req, 'glucose-post'), 60, 60_000)) return fail('Too many requests', 429)
  const parsed = await parseBody(req, createSchema)
  if ('response' in parsed) return parsed.response
  const d = parsed.data

  const reading = await db.glucoseReading.create({
    data: {
      value: d.value,
      context: d.context ?? 'random',
      carbs: d.carbs ?? null,
      tags: JSON.stringify(d.tags ?? []),
      notes: d.notes ?? null,
      source: d.source ?? 'manual',
      takenAt: d.takenAt ? new Date(d.takenAt) : new Date(),
    },
  })

  await emitEvent(
    'READING_LOGGED',
    { kind: 'glucose', id: reading.id, value: d.value, context: d.context },
    d.value < 3.9 || d.value > 13.9 ? 'high' : 'normal',
  )
  return ok({ reading }, { status: 201 })
}
