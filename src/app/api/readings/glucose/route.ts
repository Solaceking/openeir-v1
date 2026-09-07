import { db } from '@/lib/db'
import { ok, fail, parseBody, rateLimit, clientKey } from '@/lib/api-utils'
import { z } from 'zod'
import { emitEvent } from '@/lib/events'
import { detectDuplicate } from '@/lib/pipeline/dedupe'

export const dynamic = 'force-dynamic'

const createSchema = z.object({
  value: z.number().min(1).max(40), // canonical mmol/L
  context: z.enum(['fasting', 'pre_meal', 'post_meal', 'bedtime', 'random']).optional(),
  carbs: z.number().min(0).max(500).nullable().optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
  notes: z.string().max(500).nullable().optional(),
  takenAt: z.string().datetime().optional(),
  source: z.enum(['manual', 'bluetooth', 'import', 'voice', 'ocr', 'chat']).optional(),
  /** machine captures may override a duplicate guard after user confirmation */
  force: z.boolean().optional(),
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
  const source = d.source ?? 'manual'

  // Unified input pipeline: voice/ocr captures must not silently double-log
  // a reading that another source (bluetooth, manual) already recorded.
  if (!d.force) {
    const dup = await detectDuplicate(source, {
      findExisting: async () => {
        const takenAt = d.takenAt ? new Date(d.takenAt) : new Date()
        const since = new Date(takenAt.getTime() - 3 * 60 * 1000)
        const until = new Date(takenAt.getTime() + 3 * 60 * 1000)
        return db.glucoseReading.findFirst({
          where: { takenAt: { gte: since, lte: until }, value: d.value },
          orderBy: { takenAt: 'desc' },
        })
      },
      isSame: (existing) => Math.abs(existing.value - d.value) < 0.001,
    })
    if (dup.duplicate && dup.existing) {
      return ok({
        duplicate: true,
        existing: {
          id: dup.existing.id,
          value: dup.existing.value,
          source: dup.existing.source,
          takenAt: dup.existing.takenAt,
        },
        message: 'An identical reading was already captured within the last few minutes.',
      })
    }
  }

  const reading = await db.glucoseReading.create({
    data: {
      value: d.value,
      context: d.context ?? 'random',
      carbs: d.carbs ?? null,
      tags: JSON.stringify(d.tags ?? []),
      notes: d.notes ?? null,
      source,
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
