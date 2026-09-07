// OpenEir — "What If" simulator engine
// Deterministic, evidence-informed projection model + optional AI narrative on top.
// Effect sizes from published meta-analyses (AHA/ACC 2017 & lifestyle RCTs).

export interface WhatIfParams {
  weightDeltaKg: number // negative = loss
  sodiumReduction: boolean // adopt low-sodium/DASH pattern
  addedExerciseDays: number // 0..7 (30+ min aerobic)
  alcoholReduction: boolean
  adherenceImprovementPct: number // 0..(100-current)
  addedSleepHours: number // 0..2
  stressPractice: boolean // daily relaxation / breathing
  reducedCarbsPerMealG: number // 0..80
  addedPostMealWalks: boolean // 15-min walk after biggest meal
}

export interface WhatIfProjection {
  currentAvgSys: number
  projectedAvgSys: number
  currentAvgDia: number
  projectedAvgDia: number
  currentAvgGlucose: number
  projectedAvgGlucose: number
  contributions: { label: string; deltaSys: number; evidence: string }[]
  totalDeltaSys: number
  totalDeltaDia: number
  totalDeltaGlucose: number
  newInTargetPctEstimate: number
  categoryShift: { from: string; to: string }[]
  horizonWeeks: number
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function projectWhatIf(
  params: WhatIfParams,
  current: { avgSys: number; avgDia: number; avgGlucose: number; inTargetPct: number; distribution: Record<string, number> },
): WhatIfProjection {
  const contributions: { label: string; deltaSys: number; evidence: string }[] = []

  const push = (label: string, deltaSys: number, evidence: string) => {
    if (Math.abs(deltaSys) >= 0.5) contributions.push({ label, deltaSys: Math.round(deltaSys * 10) / 10, evidence })
  }

  // Weight: ≈1 mmHg SBP per kg lost (AHA meta-analysis)
  if (params.weightDeltaKg !== 0) {
    push(
      params.weightDeltaKg < 0 ? `Losing ${Math.abs(params.weightDeltaKg)} kg` : `Gaining ${params.weightDeltaKg} kg`,
      params.weightDeltaKg * -1.0,
      '≈1 mmHg SBP per kg (AHA meta-analysis)',
    )
  }
  // Sodium / DASH: 5 mmHg typical, up to 8 in hypertensives
  if (params.sodiumReduction) push('Low-sodium / DASH eating', -5, 'SSaSS & DASH trials: 5 mmHg typical')
  // Exercise: 5 mmHg per 3+ sessions/week, up to 7-8 for more
  if (params.addedExerciseDays > 0) {
    push(`+${params.addedExerciseDays} aerobic days/week`, -clamp(params.addedExerciseDays * 1.2, 0, 8), 'Aerobic exercise RCTs: 4–8 mmHg')
  }
  if (params.alcoholReduction) push('Cutting back alcohol', -4, '≈4 mmHg in regular drinkers')
  if (params.adherenceImprovementPct > 0) {
    push(`+${params.adherenceImprovementPct}% med adherence`, -clamp((params.adherenceImprovementPct / 100) * 8, 0, 8), 'Full adherence worth ≈8 mmHg vs 50%')
  }
  if (params.addedSleepHours > 0) {
    push(`+${params.addedSleepHours}h sleep`, -clamp(params.addedSleepHours * 2.2, 0, 5), 'Sleep extension studies: 2–5 mmHg')
  }
  if (params.stressPractice) push('Daily relaxation practice', -3, 'TM/breathing meta-analyses: ≈3 mmHg')

  const totalDeltaSys = clamp(Math.round(contributions.reduce((a, c) => a + c.deltaSys, 0) * 10) / 10, -40, 40)
  const totalDeltaDia = Math.round(totalDeltaSys * 0.55 * 10) / 10

  // Glucose side: carbs per meal, walks, weight
  let dg = 0
  if (params.reducedCarbsPerMealG > 0) dg += clamp(params.reducedCarbsPerMealG * 0.012, 0, 1.0)
  if (params.addedPostMealWalks) dg += 0.5
  if (params.weightDeltaKg < 0) dg += clamp(Math.abs(params.weightDeltaKg) * 0.06, 0, 0.9)
  if (params.addedExerciseDays > 0) dg += clamp(params.addedExerciseDays * 0.05, 0, 0.4)
  const totalDeltaGlucose = Math.round(dg * 100) / 100

  const projectedAvgSys = Math.round(clamp(current.avgSys + totalDeltaSys, 85, 200))
  const projectedAvgDia = Math.round(clamp(current.avgDia + totalDeltaDia, 50, 130))
  const projectedAvgGlucose = Math.round((current.avgGlucose + totalDeltaGlucose) * 10) / 10

  // Estimate new in-target %: shifting the distribution left by delta mmHg.
  // Heuristic: each 5 mmHg improvement ≈ +12pp in-target share (saturating).
  const improvementFactor = Math.max(-0.24, Math.min(0.3, (-totalDeltaSys / 5) * 0.12))
  const newInTargetPctEstimate = Math.round(clamp(current.inTargetPct + improvementFactor * 100, 0, 98))

  // Category shift estimate
  const catOf = (s: number, d: number) =>
    s >= 180 || d >= 120 ? 'crisis' : s >= 140 || d >= 90 ? 'stage2' : s >= 130 || d >= 80 ? 'stage1' : s >= 120 ? 'elevated' : 'normal'
  const from = catOf(Math.round(current.avgSys), Math.round(current.avgDia))
  const to = catOf(projectedAvgSys, projectedAvgDia)
  const categoryShift = from !== to ? [{ from, to }] : []

  return {
    currentAvgSys: Math.round(current.avgSys),
    projectedAvgSys,
    currentAvgDia: Math.round(current.avgDia),
    projectedAvgDia,
    currentAvgGlucose: current.avgGlucose,
    projectedAvgGlucose,
    contributions: contributions.sort((a, b) => a.deltaSys - b.deltaSys),
    totalDeltaSys,
    totalDeltaDia,
    totalDeltaGlucose,
    newInTargetPctEstimate,
    categoryShift,
    horizonWeeks: 12, // lifestyle effects materialize over ~12 weeks
  }
}

export const DEFAULT_PARAMS: WhatIfParams = {
  weightDeltaKg: 0,
  sodiumReduction: false,
  addedExerciseDays: 0,
  alcoholReduction: false,
  adherenceImprovementPct: 0,
  addedSleepHours: 0,
  stressPractice: false,
  reducedCarbsPerMealG: 0,
  addedPostMealWalks: false,
}
