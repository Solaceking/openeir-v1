// Thin wrapper over the shared write path (src/lib/health/record.ts).

import { ok, parseBody } from '@/lib/api-utils'
import { upsertLifestyleLog, lifestyleInputSchema } from '@/lib/health/record'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const days = Math.min(365, Number(url.searchParams.get('days') ?? 60))
  const { db } = await import('@/lib/db')
  const since = new Date()
  since.setDate(since.getDate() - days)
  const rows = await db.lifestyleLog.findMany({
    where: { date: { gte: since.toISOString().slice(0, 10) } },
    orderBy: { date: 'desc' },
  })
  return ok({ logs: rows })
}

export async function POST(req: Request) {
  const parsed = await parseBody(req, lifestyleInputSchema)
  if ('response' in parsed) return parsed.response
  const result = await upsertLifestyleLog(parsed.data)
  return ok({ log: result.row })
}
