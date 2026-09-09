// OpenEir — agent transparency API (Settings → AI agent).
// GET /api/agent-governance       → permissions + recent audit + tool stats
// PUT /api/agent-governance       → update permission categories
// GET /api/agent-governance?pending=1 → unresolved pending actions

import { db } from '@/lib/db'
import { ok, parseBody } from '@/lib/api-utils'
import { z } from 'zod'
import { getAgentPermissions, saveAgentPermissions, AGENT_TOOLS } from '@/lib/ai/tools'

export const dynamic = 'force-dynamic'

const putSchema = z.object({
  write: z.boolean().optional(),
  destructive: z.boolean().optional(),
})

export async function GET(req: Request) {
  const url = new URL(req.url)
  const permissions = await getAgentPermissions()

  if (url.searchParams.get('pending')) {
    const rows = await db.pendingAction.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    return ok({
      pending: rows.map((r) => ({
        id: r.id, tool: r.tool, readback: r.readback, risk: r.risk,
        status: r.status, origin: r.origin, createdAt: r.createdAt.toISOString(),
        args: safeParse(r.args),
      })),
    })
  }

  const [recent, counts, byTool] = await Promise.all([
    db.toolAudit.findMany({ orderBy: { createdAt: 'desc' }, take: 60 }),
    db.toolAudit.groupBy({ by: ['status'], _count: { _all: true } }),
    db.toolAudit.groupBy({ by: ['tool'], _count: { _all: true }, _avg: { latencyMs: true }, _sum: { latencyMs: true } }),
  ])

  return ok({
    permissions,
    tools: AGENT_TOOLS.map((t) => ({ name: t.name, description: t.description, category: t.category, risk: t.risk })),
    recent: recent.map((r) => ({
      id: r.id, tool: r.tool, category: r.category, risk: r.risk,
      status: r.status, outcome: r.outcome, origin: r.origin,
      providerLabel: r.providerLabel, model: r.model, latencyMs: r.latencyMs,
      args: safeParse(r.args), reason: r.reason, error: r.error,
      createdAt: r.createdAt.toISOString(),
    })),
    counts: counts.map((c) => ({ status: c.status, count: c._count._all })),
    byTool: byTool
      .map((t) => ({ tool: t.tool, calls: t._count._all, avgLatencyMs: Math.round(t._avg.latencyMs ?? 0), totalLatencyMs: t._sum.latencyMs ?? 0 }))
      .sort((a, b) => b.calls - a.calls),
  })
}

export async function PUT(req: Request) {
  const parsed = await parseBody(req, putSchema)
  if ('response' in parsed) return parsed.response
  const permissions = await saveAgentPermissions(parsed.data)
  return ok({ permissions })
}

function safeParse(json: string): Record<string, unknown> {
  try { return JSON.parse(json) as Record<string, unknown> } catch { return {} }
}
