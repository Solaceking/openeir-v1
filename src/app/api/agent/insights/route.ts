// OpenEir — Agent insight push: autonomous agents deliver findings here.
import { db } from '@/lib/db'
import { ok, fail, parseBody, rateLimit, clientKey } from '@/lib/api-utils'
import { z } from 'zod'
import { publishRealtime } from '@/lib/events'

export const dynamic = 'force-dynamic'

const schema = z.object({
  title: z.string().min(3).max(120),
  body: z.string().min(3).max(2000),
  severity: z.enum(['info', 'low', 'medium', 'high', 'critical']).optional(),
  kind: z.string().max(30).optional(),
  agentName: z.string().max(60).optional(),
  dataJson: z.record(z.string(), z.unknown()).optional(),
})

export async function POST(req: Request) {
  if (!rateLimit(clientKey(req, 'agent-push'), 20, 60_000)) return fail('Too many pushes', 429)
  const parsed = await parseBody(req, schema)
  if ('response' in parsed) return parsed.response
  const d = parsed.data

  const insight = await db.insight.create({
    data: {
      kind: d.kind ?? 'agent',
      severity: d.severity ?? 'info',
      title: d.title,
      body: d.body,
      dataJson: d.dataJson ? JSON.stringify(d.dataJson) : null,
      origin: 'agent',
      sourceEvent: d.agentName ? `AGENT:${d.agentName.slice(0, 40)}` : 'AGENT',
    },
  })
  publishRealtime('insight:new', {
    id: insight.id, kind: insight.kind, severity: insight.severity,
    title: insight.title, body: insight.body, origin: 'agent',
    createdAt: insight.createdAt,
  })
  return ok({ id: insight.id }, { status: 201 })
}
