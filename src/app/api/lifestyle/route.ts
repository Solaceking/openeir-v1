import { db } from '@/lib/db'
import { ok, parseBody } from '@/lib/api-utils'
import { z } from 'zod'
import { emitEvent } from '@/lib/events'

export const dynamic = 'force-dynamic'

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mood: z.number().int().min(1).max(5).nullable().optional(),
  energy: z.number().int().min(1).max(5).nullable().optional(),
  sleepQuality: z.number().int().min(1).max(5).nullable().optional(),
  stress: z.number().int().min(1).max(5).nullable().optional(),
  weightKg: z.number().min(25).max(400).nullable().optional(),
  sodiumHigh: z.boolean().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
})

export async function GET(req: Request) {
  const url = new URL(req.url)
  const days = Math.min(365, Number(url.searchParams.get('days') ?? 60))
  const since = new Date()
  since.setDate(since.getDate() - days)
  const rows = await db.lifestyleLog.findMany({
    where: { date: { gte: since.toISOString().slice(0, 10) } },
    orderBy: { date: 'desc' },
  })
  return ok({ logs: rows })
}

export async function POST(req: Request) {
  const parsed = await parseBody(req, schema)
  if ('response' in parsed) return parsed.response
  const d = parsed.data
  const { date, ...rest } = d
  const clean = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined))
  const log = await db.lifestyleLog.upsert({
    where: { date },
    create: { date, ...clean },
    update: clean,
  })
  void emitEvent('PATTERN_CHECK', { kind: 'lifestyle' }, 'low')
  return ok({ log })
}
