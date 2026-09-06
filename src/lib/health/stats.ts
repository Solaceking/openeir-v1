// OpenEir — statistics & analytics core (pure functions, unit-tested)

export interface BpPoint {
  systolic: number; diastolic: number; pulse?: number | null
  takenAt: string | Date; label?: string; tags?: string[]; id?: string
}
export interface GlucosePoint {
  value: number; context: string; carbs?: number | null
  takenAt: string | Date; id?: string
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
export const std = (xs: number[]) => {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}

/** Ordinary least squares: returns slope per day given points (x in days). */
export function trendSlopePerDay(pairs: { x: number; y: number }[]): number {
  const n = pairs.length
  if (n < 3) return 0
  const mx = mean(pairs.map((p) => p.x))
  const my = mean(pairs.map((p) => p.y))
  let num = 0, den = 0
  for (const p of pairs) { num += (p.x - mx) * (p.y - my); den += (p.x - mx) ** 2 }
  return den === 0 ? 0 : num / den
}

export function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length)
  if (n < 4) return 0
  const mx = mean(xs.slice(0, n)), my = mean(ys.slice(0, n))
  let num = 0, dx = 0, dy = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my)
    dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0
}

export const dayKey = (d: string | Date) => new Date(d).toISOString().slice(0, 10)
export const daysAgoIso = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() - n); return d
}
export const withinDays = (d: string | Date, days: number) =>
  new Date(d).getTime() >= daysAgoIso(days).getTime()

// ---------- BP analytics ----------
export interface BpStats {
  count: number
  avgSys: number; avgDia: number; avgPulse: number
  maxSys: number; maxDia: number
  minSys: number; minDia: number
  stdSys: number
  inTargetPct: number
  distribution: Record<string, number>
  sysSlopePerDay: number // over provided window
  morningAvgSys: number; eveningAvgSys: number
}

export function bpStats(readings: BpPoint[], sysTarget = 130, diaTarget = 80, windowDays = 30): BpStats {
  const recent = readings.filter((r) => withinDays(r.takenAt, windowDays))
  const sys = recent.map((r) => r.systolic)
  const dia = recent.map((r) => r.diastolic)
  const pulse = recent.map((r) => r.pulse).filter((v): v is number => typeof v === 'number')
  const dist: Record<string, number> = { low: 0, normal: 0, elevated: 0, stage1: 0, stage2: 0, crisis: 0 }
  let inTarget = 0
  for (const r of recent) {
    const c = cat(r)
    dist[c]++
    if (r.systolic < sysTarget && r.diastolic < diaTarget) inTarget++
  }
  const t0 = daysAgoIso(windowDays).getTime()
  const slope = trendSlopePerDay(
    recent.map((r) => ({ x: (new Date(r.takenAt).getTime() - t0) / 86400000, y: r.systolic })),
  )
  const morning = recent.filter((r) => r.label === 'morning').map((r) => r.systolic)
  const evening = recent.filter((r) => r.label === 'evening').map((r) => r.systolic)
  return {
    count: recent.length,
    avgSys: round1(mean(sys)), avgDia: round1(mean(dia)), avgPulse: Math.round(mean(pulse)),
    maxSys: sys.length ? Math.max(...sys) : 0, maxDia: dia.length ? Math.max(...dia) : 0,
    minSys: sys.length ? Math.min(...sys) : 0, minDia: dia.length ? Math.min(...dia) : 0,
    stdSys: round1(std(sys)),
    inTargetPct: recent.length ? Math.round((inTarget / recent.length) * 100) : 0,
    distribution: dist,
    sysSlopePerDay: round2(slope),
    morningAvgSys: Math.round(mean(morning)),
    eveningAvgSys: Math.round(mean(evening)),
  }
}
const cat = (r: BpPoint) => {
  if (r.systolic >= 180 || r.diastolic >= 120) return 'crisis'
  if (r.systolic >= 140 || r.diastolic >= 90) return 'stage2'
  if (r.systolic >= 130 || r.diastolic >= 80) return 'stage1'
  if (r.systolic >= 120) return 'elevated'
  if (r.systolic <= 90 || r.diastolic <= 60) return 'low'
  return 'normal'
}

// ---------- Glucose analytics ----------
export interface GlucoseStats {
  count: number
  avg: number
  timeInRangePct: number
  belowPct: number
  abovePct: number
  avgFasting: number
  avgPostMeal: number
  estimatedHbA1c: number
  std: number
}

export function glucoseStats(
  readings: GlucosePoint[],
  targets: { min: number; max: number },
  windowDays = 30,
): GlucoseStats {
  const recent = readings.filter((r) => withinDays(r.takenAt, windowDays))
  if (!recent.length) {
    return { count: 0, avg: 0, timeInRangePct: 0, belowPct: 0, abovePct: 0, avgFasting: 0, avgPostMeal: 0, estimatedHbA1c: 0, std: 0 }
  }
  let inR = 0, below = 0
  for (const r of recent) {
    if (r.value < 3.9) below++
    else if (r.value >= targets.min && r.value <= targets.max) inR++
  }
  const above = recent.length - inR - below
  const fasting = recent.filter((r) => r.context === 'fasting').map((r) => r.value)
  const post = recent.filter((r) => r.context === 'post_meal').map((r) => r.value)
  const avg = mean(recent.map((r) => r.value))
  const mgdl = avg * 18.016
  return {
    count: recent.length,
    avg: round1(avg),
    timeInRangePct: Math.round((inR / recent.length) * 100),
    belowPct: Math.round((below / recent.length) * 100),
    abovePct: Math.round((above / recent.length) * 100),
    avgFasting: round1(mean(fasting)),
    avgPostMeal: round1(mean(post)),
    estimatedHbA1c: Math.round((3.31 + 0.02392 * mgdl) * 10) / 10,
    std: round1(std(recent.map((r) => r.value))),
  }
}

// ---------- Adherence ----------
export interface AdherenceStats {
  total: number; taken: number; missed: number; delayed: number; skipped: number; pending: number
  pct: number
  consecutiveTaken: number // current streak across all meds
  missedRecent: { date: string; time: string; med?: string }[]
}

export function adherenceStats(
  logs: { date: string; scheduledTime: string; status: string; medicationName?: string }[],
  windowDays = 14,
): AdherenceStats {
  const cutoff = daysAgoIso(windowDays).toISOString().slice(0, 10)
  const relevant = logs.filter((l) => l.date >= cutoff && l.status !== 'pending')
  const byStatus = (s: string) => relevant.filter((l) => l.status === s).length
  const taken = byStatus('taken'), missed = byStatus('missed'), delayed = byStatus('delayed'), skipped = byStatus('skipped')
  const completed = taken + missed + delayed + skipped
  // current streak: walk back day by day from today, count consecutive days where every scheduled dose was taken/delayed
  const byDate = new Map<string, typeof relevant>()
  for (const l of relevant) {
    const arr = byDate.get(l.date) ?? []
    arr.push(l); byDate.set(l.date, arr)
  }
  let streak = 0
  for (let i = 0; i < windowDays; i++) {
    const key = daysAgoIso(i).toISOString().slice(0, 10)
    const dayLogs = byDate.get(key)
    if (!dayLogs || !dayLogs.length) continue
    const allOk = dayLogs.every((l) => l.status === 'taken' || l.status === 'delayed')
    if (allOk) streak++
    else break
  }
  const missedRecent = relevant
    .filter((l) => l.status === 'missed')
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10)
    .map((l) => ({ date: l.date, time: l.scheduledTime, med: l.medicationName }))
  const pending = logs.filter((l) => l.date >= cutoff && l.status === 'pending').length
  return {
    total: completed, taken, missed, delayed, skipped, pending,
    pct: completed ? Math.round(((taken + delayed) / completed) * 100) : 100,
    consecutiveTaken: streak,
    missedRecent,
  }
}

// ---------- Streaks (logging) ----------
export function loggingStreak(dates: Set<string>): number {
  let streak = 0
  for (let i = 0; i < 365; i++) {
    const key = daysAgoIso(i).toISOString().slice(0, 10)
    if (dates.has(key)) streak++
    else if (i > 0) break // today may not be logged yet
    else continue
  }
  return streak
}

// ---------- Correlations ----------
export interface Correlation {
  factor: string
  coefficient: number
  n: number
  interpretation: string
  deltaSys?: number // mean SBP with factor vs without
}

export function correlateTagsWithSystolic(
  readings: (BpPoint & { tags?: string[] })[],
  windowDays = 45,
): Correlation[] {
  const recent = readings.filter((r) => withinDays(r.takenAt, windowDays))
  const factors = new Set<string>()
  for (const r of recent) for (const t of r.tags ?? []) factors.add(t)
  const out: Correlation[] = []
  for (const f of factors) {
    const withF = recent.filter((r) => (r.tags ?? []).includes(f)).map((r) => r.systolic)
    const withoutF = recent.filter((r) => !(r.tags ?? []).includes(f)).map((r) => r.systolic)
    if (withF.length < 4 || withoutF.length < 4) continue
    const delta = round1(mean(withF) - mean(withoutF))
    const coef = round2(pearson(
      recent.map((r) => ((r.tags ?? []).includes(f) ? 1 : 0)),
      recent.map((r) => r.systolic),
    ))
    out.push({
      factor: f,
      coefficient: coef,
      n: withF.length,
      deltaSys: delta,
      interpretation: Math.abs(delta) < 2 ? 'no meaningful effect'
        : delta > 0 ? `readings average ${delta} mmHg higher` : `readings average ${Math.abs(delta)} mmHg lower`,
    })
  }
  return out.sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient))
}

/** Correlate sleep quality (1-5) with next-morning systolic. */
export function correlateSleepToMorningBp(
  lifestyle: { date: string; sleepQuality?: number | null }[],
  readings: BpPoint[],
): Correlation {
  const morningByDate = new Map<string, number[]>()
  for (const r of readings) {
    const d = new Date(r.takenAt)
    if (r.label !== 'morning' && d.getHours() >= 11) continue
    const key = d.toISOString().slice(0, 10)
    const arr = morningByDate.get(key) ?? []
    arr.push(r.systolic); morningByDate.set(key, arr)
  }
  const xs: number[] = [], ys: number[] = []
  for (const l of lifestyle) {
    if (!l.sleepQuality) continue
    const next = new Date(l.date + 'T00:00:00'); next.setDate(next.getDate() + 1)
    const key = next.toISOString().slice(0, 10)
    const mornings = morningByDate.get(key)
    if (mornings?.length) { xs.push(l.sleepQuality); ys.push(mean(mornings)) }
  }
  const coef = round2(pearson(xs, ys))
  const poor = ys.filter((_, i) => xs[i] <= 2)
  const good = ys.filter((_, i) => xs[i] >= 4)
  const delta = poor.length >= 3 && good.length >= 3 ? round1(mean(poor) - mean(good)) : undefined
  return {
    factor: 'poor sleep → next-morning systolic',
    coefficient: coef,
    n: xs.length,
    deltaSys: delta,
    interpretation: delta === undefined ? 'not enough paired data yet'
      : delta > 3 ? `after poor sleep mornings run ${delta} mmHg higher`
      : Math.abs(delta) <= 3 ? 'sleep quality shows little effect' : `after poor sleep mornings run ${Math.abs(delta)} mmHg lower`,
  }
}

const round1 = (v: number) => Math.round(v * 10) / 10
const round2 = (v: number) => Math.round(v * 100) / 100
