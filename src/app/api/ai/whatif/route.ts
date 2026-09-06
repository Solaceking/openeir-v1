// OpenEir — "What If" simulator: deterministic projection + AI narrative.
import { db } from '@/lib/db'
import { ok, fail, parseBody, rateLimit, clientKey } from '@/lib/api-utils'
import { z } from 'zod'
import { projectWhatIf, DEFAULT_PARAMS, type WhatIfParams } from '@/lib/health/whatif'
import { buildHealthContext } from '@/lib/ai/context'
import { completeChat } from '@/lib/ai/providers'
import { bpStats, type BpPoint } from '@/lib/health/stats'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const parse = <T,>(s: string | null | undefined, fb: T): T => { try { return s ? JSON.parse(s) as T : fb } catch { return fb } }

const schema = z.object({
  params: z.object({
    weightDeltaKg: z.number().min(-40).max(40).optional(),
    sodiumReduction: z.boolean().optional(),
    addedExerciseDays: z.number().int().min(0).max(7).optional(),
    alcoholReduction: z.boolean().optional(),
    adherenceImprovementPct: z.number().min(0).max(100).optional(),
    addedSleepHours: z.number().min(0).max(2).optional(),
    stressPractice: z.boolean().optional(),
    reducedCarbsPerMealG: z.number().min(0).max(80).optional(),
    addedPostMealWalks: z.boolean().optional(),
  }),
  narrative: z.boolean().optional(),
})

export async function POST(req: Request) {
  if (!rateLimit(clientKey(req, 'whatif'), 10, 60_000)) return fail('Too many simulations in a row — pause a moment.', 429)
  const parsed = await parseBody(req, schema)
  if ('response' in parsed) return parsed.response
  const userParams: WhatIfParams = { ...DEFAULT_PARAMS, ...parsed.data.params }
  const wantNarrative = parsed.data.narrative !== false

  const profileRow = await db.profile.findFirst()
  if (!profileRow) return fail('Complete setup first', 400)

  const bpRows = await db.bpReading.findMany({ orderBy: { takenAt: 'desc' }, take: 200 })
  const glRows = await db.glucoseReading.findMany({ orderBy: { takenAt: 'desc' }, take: 200 })
  const bpPoints: BpPoint[] = bpRows.map((r) => ({ systolic: r.systolic, diastolic: r.diastolic, takenAt: r.takenAt.toISOString() }))
  const bp = bpStats(bpPoints, profileRow.bpSystolicTarget, profileRow.bpDiastolicTarget, 30)
  const avgGlucose = glRows.length ? Math.round((glRows.reduce((a, r) => a + r.value, 0) / glRows.length) * 10) / 10 : 0

  if (bp.count === 0) return fail('Log some blood pressure readings first', 400)

  const projection = projectWhatIf(userParams, {
    avgSys: bp.avgSys, avgDia: bp.avgDia, avgGlucose,
    inTargetPct: bp.inTargetPct, distribution: bp.distribution,
  })

  let narrative: string | null = null
  if (wantNarrative) {
    const ctx = await buildHealthContext()
    if (ctx) {
      const result = await completeChat('whatif', [
        {
          role: 'system',
          content: 'You are Eir in the OpenEir app. The user just ran a "What-If" simulation. In under 110 words, interpret the projection: name the biggest lever they chose, what it could mean over ~12 weeks, and one honest caveat (simulations are estimates, not promises). Cite the actual projected numbers. Plain text, no headers.',
        },
        {
          role: 'user',
          content: `Simulation params: ${JSON.stringify(userParams)}\nProjection: ${JSON.stringify(projection)}\nUser context: avg ${ctx.bp.avgSys}/${ctx.bp.avgDia}, adherence ${ctx.adherence.pct}%, score ${ctx.score.total}/100.`,
        },
      ])
      if (result.ok) narrative = result.text.trim()
    }
  }

  const scenario = await db.whatIfScenario.create({
    data: {
      question: Object.entries(userParams).filter(([, v]) => v && v !== 0).map(([k]) => k).join(', ') || 'no changes',
      paramsJson: JSON.stringify(userParams),
      projectionJson: JSON.stringify(projection),
      narrative,
    },
  })

  return ok({ projection, narrative, params: userParams, scenarioId: scenario.id })
}

export async function GET() {
  const scenarios = await db.whatIfScenario.findMany({ orderBy: { createdAt: 'desc' }, take: 10 })
  return ok({
    scenarios: scenarios.map((s) => ({ ...s, paramsJson: parse(s.paramsJson, {}), projectionJson: parse(s.projectionJson, {}) })),
  })
}
