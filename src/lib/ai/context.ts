// OpenEir — Context Window Builder.
// Before ANY AI invocation, this assembles the richest possible picture of the
// user's health state: profile, targets, recent readings, adherence, patterns,
// correlations, warnings, score and recent AI history. Event-driven AI is only
// as good as the context it receives — this is the single source of truth.

import { db } from '@/lib/db'
import { bpStats, glucoseStats, adherenceStats, correlateTagsWithSystolic, correlateSleepToMorningBp, loggingStreak, type BpPoint, type GlucosePoint } from '@/lib/health/stats'
import { computeEirScore, bpSeverityPenalty } from '@/lib/health/score'
import { detectEarlyWarnings } from '@/lib/health/warnings'

export interface HealthContext {
  profile: {
    name: string; age?: number; sex?: string; conditions: string[]
    sysTarget: number; diaTarget: number; glucoseMin: number; glucoseMax: number; weightTarget?: number
  }
  bp: ReturnType<typeof bpStats>
  glucose: ReturnType<typeof glucoseStats> & { prevAvg?: number }
  adherence: ReturnType<typeof adherenceStats>
  score: ReturnType<typeof computeEirScore>
  warnings: ReturnType<typeof detectEarlyWarnings>
  correlations: { factor: string; interpretation: string; coefficient: number; deltaSys?: number }[]
  sleepCorrelation: ReturnType<typeof correlateSleepToMorningBp>
  streakDays: number
  recentInsights: { title: string; severity: string; createdAt: string }[]
  weightTrend: { start: number; now: number } | null
  raw: {
    bpReadings7d: BpPoint[]
    glucoseReadings14d: GlucosePoint[]
    lifestyle14d: { date: string; mood?: number; energy?: number; sleepQuality?: number; stress?: number; sodiumHigh?: boolean; weightKg?: number }[]
  }
}

const parse = <T,>(s: string | null | undefined, fallback: T): T => {
  try { return s ? JSON.parse(s) as T : fallback } catch { return fallback }
}

export async function buildHealthContext(): Promise<HealthContext | null> {
  const profileRow = await db.profile.findFirst()
  if (!profileRow) return null

  const [bpRows, glRows, meds, logs, lifeRows, recentInsightRows] = await Promise.all([
    db.bpReading.findMany({ orderBy: { takenAt: 'desc' }, take: 400 }),
    db.glucoseReading.findMany({ orderBy: { takenAt: 'desc' }, take: 400 }),
    db.medication.findMany({ where: { active: true } }),
    db.medicationLog.findMany({ orderBy: { createdAt: 'desc' }, take: 800 }),
    db.lifestyleLog.findMany({ orderBy: { date: 'desc' }, take: 45 }),
    db.insight.findMany({ orderBy: { createdAt: 'desc' }, take: 8, where: { status: { not: 'dismissed' } } }),
  ])

  const bpPoints: BpPoint[] = bpRows.map((r) => ({
    id: r.id, systolic: r.systolic, diastolic: r.diastolic, pulse: r.pulse,
    takenAt: r.takenAt.toISOString(), label: r.label, tags: parse<string[]>(r.tags, []),
  }))
  const glPoints: GlucosePoint[] = glRows.map((r) => ({
    id: r.id, value: r.value, context: r.context, carbs: r.carbs,
    takenAt: r.takenAt.toISOString(),
  }))

  const bp30 = bpStats(bpPoints, profileRow.bpSystolicTarget, profileRow.bpDiastolicTarget, 30)
  const gl30 = glucoseStats(glPoints, { min: profileRow.glucoseTargetMin, max: profileRow.glucoseTargetMax }, 30)

  const logRows = logs.map((l) => ({
    date: l.date, scheduledTime: l.scheduledTime, status: l.status,
    medicationName: meds.find((m) => m.id === l.medicationId)?.name,
  }))
  const adherence = adherenceStats(logRows, 14)
  const adherencePrev = adherenceStats(
    logRows.filter((l) => l.date < new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)),
    14,
  )

  const life14 = lifeRows.filter((r) => r.date >= new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10))
  const lifestyleVals = life14.flatMap((l) => [l.mood, l.energy, l.sleepQuality, l.stress ? 6 - l.stress : undefined])
    .filter((v): v is number => typeof v === 'number')
  const lifestyleAvg = lifestyleVals.length ? lifestyleVals.reduce((a, b) => a + b, 0) / lifestyleVals.length : 3.5

  const loggedDays = new Set<string>()
  for (const r of bpRows) if (Date.now() - r.takenAt.getTime() < 14 * 86400000) loggedDays.add(r.takenAt.toISOString().slice(0, 10))
  for (const r of glRows) if (Date.now() - r.takenAt.getTime() < 14 * 86400000) loggedDays.add(r.takenAt.toISOString().slice(0, 10))

  const score = computeEirScore({
    bpInTargetPct: bp30.inTargetPct,
    bpSeverityPenalty: bpSeverityPenalty(bp30.distribution),
    glucoseInRangePct: gl30.timeInRangePct,
    adherencePct: adherence.pct,
    lifestyleAvg,
    consistencyPct: Math.round((loggedDays.size / 14) * 100),
    hasGlucoseData: glPoints.length > 0,
    hasMedData: meds.length > 0,
  })

  const warnings = detectEarlyWarnings({
    bp30,
    bp7: bpStats(bpPoints, profileRow.bpSystolicTarget, profileRow.bpDiastolicTarget, 7),
    adherencePct14: adherence.pct,
    adherencePctPrev: adherencePrev.pct,
    glucose30: gl30,
    glucosePrev: glucoseStats(glPoints, { min: profileRow.glucoseTargetMin, max: profileRow.glucoseTargetMax }, 60),
    hasGlucose: glPoints.length > 0,
  })

  const correlations = correlateTagsWithSystolic(bpPoints).slice(0, 5)
  const sleepCorrelation = correlateSleepToMorningBp(
    lifeRows.map((l) => ({ date: l.date, sleepQuality: l.sleepQuality })),
    bpPoints,
  )

  const weights = lifeRows.filter((l) => typeof l.weightKg === 'number')
  const weightTrend = weights.length >= 2
    ? { start: weights[weights.length - 1].weightKg as number, now: weights[0].weightKg as number }
    : null

  const age = profileRow.birthYear ? new Date().getFullYear() - profileRow.birthYear : undefined

  return {
    profile: {
      name: profileRow.fullName,
      age,
      sex: profileRow.sex ?? undefined,
      conditions: parse<string[]>(profileRow.conditions, []),
      sysTarget: profileRow.bpSystolicTarget,
      diaTarget: profileRow.bpDiastolicTarget,
      glucoseMin: profileRow.glucoseTargetMin,
      glucoseMax: profileRow.glucoseTargetMax,
      weightTarget: profileRow.weightTargetKg ?? undefined,
    },
    bp: bp30,
    glucose: { ...gl30, prevAvg: glucoseStats(glPoints, { min: profileRow.glucoseTargetMin, max: profileRow.glucoseTargetMax }, 60).avg },
    adherence,
    score,
    warnings,
    correlations,
    sleepCorrelation,
    streakDays: loggingStreak(loggedDays),
    recentInsights: recentInsightRows.map((i) => ({ title: i.title, severity: i.severity, createdAt: i.createdAt.toISOString() })),
    weightTrend,
    raw: {
      bpReadings7d: bpPoints.filter((r) => Date.now() - new Date(r.takenAt).getTime() < 7 * 86400000).slice(0, 30),
      glucoseReadings14d: glPoints.filter((r) => Date.now() - new Date(r.takenAt).getTime() < 14 * 86400000).slice(0, 40),
      lifestyle14d: life14.map((l) => ({
        date: l.date, mood: l.mood ?? undefined, energy: l.energy ?? undefined,
        sleepQuality: l.sleepQuality ?? undefined, stress: l.stress ?? undefined,
        sodiumHigh: l.sodiumHigh ?? undefined, weightKg: l.weightKg ?? undefined,
      })),
    },
  }
}

/** Compact, token-efficient serialization for prompts. */
export function contextForPrompt(ctx: HealthContext, depth: 'light' | 'full' = 'full'): string {
  const base = {
    user: { name: ctx.profile.name, age: ctx.profile.age, conditions: ctx.profile.conditions },
    targets: { bp: `${ctx.profile.sysTarget}/${ctx.profile.diaTarget}`, glucose_mmol: [ctx.profile.glucoseMin, ctx.profile.glucoseMax] },
    bp_30d: {
      avg: `${ctx.bp.avgSys}/${ctx.bp.avgDia}`, pulse: ctx.bp.avgPulse,
      in_target: `${ctx.bp.inTargetPct}%`, distribution: ctx.bp.distribution,
      sys_trend_mmHg_per_day: ctx.bp.sysSlopePerDay,
      morning_avg: ctx.bp.morningAvgSys, evening_avg: ctx.bp.eveningAvgSys, variability: ctx.bp.stdSys,
    },
    glucose_30d: {
      avg: ctx.glucose.avg, time_in_range: `${ctx.glucose.timeInRangePct}%`,
      est_HbA1c: ctx.glucose.estimatedHbA1c, fasting_avg: ctx.glucose.avgFasting, post_meal_avg: ctx.glucose.avgPostMeal,
    },
    adherence_14d: { pct: ctx.adherence.pct, missed: ctx.adherence.missed, streak: ctx.adherence.consecutiveTaken },
    eir_score: { total: ctx.score.total, grade: ctx.score.grade, weakest: [...ctx.score.components].sort((a, b) => a.value - b.value)[0].label },
    warnings: ctx.warnings.map((w) => ({ type: w.type, severity: w.severity, title: w.title })),
    correlations: [...ctx.correlations.map((c) => ({ factor: c.factor, effect: c.interpretation })), { factor: ctx.sleepCorrelation.factor, effect: ctx.sleepCorrelation.interpretation }],
    streak_days: ctx.streakDays,
    weight_trend_kg: ctx.weightTrend ? { from: ctx.weightTrend.start, now: ctx.weightTrend.now } : undefined,
  }
  if (depth === 'light') return JSON.stringify(base)
  return JSON.stringify({
    ...base,
    recent_bp_readings: ctx.raw.bpReadings7d.map((r) => ({
      at: r.takenAt, sys: r.systolic, dia: r.diastolic, pulse: r.pulse, label: r.label, tags: r.tags,
    })),
    recent_glucose: ctx.raw.glucoseReadings14d.map((r) => ({ at: r.takenAt, mmol: r.value, ctx: r.context, carbs: r.carbs ?? undefined })),
    lifestyle_14d: ctx.raw.lifestyle14d,
    recent_insights: ctx.recentInsights,
  })
}
