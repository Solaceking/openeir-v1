// Thin wrapper over the shared write path (src/lib/health/record.ts).
// Business rules — duplicate guard, event emission — live there exactly once
// so REST, voice, OCR and the AI agent tool layer can never diverge.

import { ok, fail, parseBody, rateLimit, clientKey } from '@/lib/api-utils'
import { logBpReading, bpInputSchema } from '@/lib/health/record'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const days = Math.min(365, Number(url.searchParams.get('days') ?? 90))
  const limit = Math.min(2000, Number(url.searchParams.get('limit') ?? 500))
  const { db } = await import('@/lib/db')
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
  const parsed = await parseBody(req, bpInputSchema)
  if ('response' in parsed) return parsed.response

  const result = await logBpReading(parsed.data)
  if (!result.saved) {
    return ok({ duplicate: true, existing: result.existing, message: result.summary })
  }
  return ok({ reading: result.row }, { status: 201 })
}
