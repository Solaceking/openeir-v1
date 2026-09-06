import { db } from '@/lib/db'
import { ok, fail, parseBody, rateLimit, clientKey } from '@/lib/api-utils'
import { z } from 'zod'
import { emitEvent } from '@/lib/events'
import { detectDuplicate } from '@/lib/pipeline/dedupe'

export const dynamic = 'force-dynamic'

const createSchema = z.object({
  systolic: z.number().int().min(60).max(260),
  diastolic: z.number().int().min(30).max(180),
  pulse: z.number().int().min(25).max(250).nullable().optional(),
  arm: z.enum(['left', 'right']).optional(),
  label: z.enum(['morning', 'evening', 'pre_med', 'post_med', 'general']).optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
  notes: z.string().max(500).nullable().optional(),
  takenAt: z.string().datetime().optional(),
  source: z.enum(['manual', 'bluetooth', 'import', 'voice', 'ocr']).optional(),
  /** machine captures may override a duplicate guard after user confirmation */
  force: z.boolean().optional(),
})

export async function GET(req: Request) {
  const url = new URL(req.url)
  const days = Math.min(365, Number(url.searchParams.get('days') ?? 90))
  const limit = Math.min(2000, Number(url.searchParams.get('limit') ?? 500))
  const since = new Date()
  since.setDate(since.getDate() - days)
  const rows = await db.bpReading.findMany({
    where: { takenAt: { gte: since } },
    orderBy: { takenAt: 'desc' },
    take: limit,
  })
  return ok({ readings: rows })
}

export async function POST(req: Request) {
  if (!rateLimit(clientKey(req, 'bp-post'), 60, 60_000)) return fail('Too many requests', 429)
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
        return db.bpReading.findFirst({
          where: { takenAt: { gte: since, lte: until }, systolic: d.systolic, diastolic: d.diastolic },
          orderBy: { takenAt: 'desc' },
        })
      },
      isSame: (existing) => existing.systolic === d.systolic && existing.diastolic === d.diastolic,
    })
    if (dup.duplicate && dup.existing) {
      return ok({
        duplicate: true,
        existing: {
          id: dup.existing.id,
          systolic: dup.existing.systolic,
          diastolic: dup.existing.diastolic,
          source: dup.existing.source,
          takenAt: dup.existing.takenAt,
        },
        message: 'An identical reading was already captured within the last few minutes.',
      })
    }
  }

  const reading = await db.bpReading.create({
    data: {
      systolic: d.systolic,
      diastolic: d.diastolic,
      pulse: d.pulse ?? null,
      arm: d.arm ?? 'left',
      label: d.label ?? 'general',
      tags: JSON.stringify(d.tags ?? []),
      notes: d.notes ?? null,
      source,
      takenAt: d.takenAt ? new Date(d.takenAt) : new Date(),
    },
  })

  await emitEvent('READING_LOGGED', { kind: 'bp', id: reading.id, systolic: d.systolic, diastolic: d.diastolic }, d.systolic >= 140 || d.diastolic >= 90 ? 'high' : 'normal')
  return ok({ reading }, { status: 201 })
}
