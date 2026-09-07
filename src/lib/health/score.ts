// OpenEir — "Eir Score": one honest composite number for your cardiometabolic health.
// Weighted, explainable, and computed entirely from your own data. No black boxes.

export interface ScoreComponent {
  key: string
  label: string
  weight: number // sum = 1
  value: number // 0..100
  detail: string
}

export interface EirScore {
  total: number // 0..100
  grade: 'excellent' | 'good' | 'fair' | 'attention'
  gradeLabel: string
  components: ScoreComponent[]
  spark: string // one-line narrative
}

interface ScoreInput {
  bpInTargetPct: number
  bpSeverityPenalty: number // 0..30 based on recent stage-2/crisis share
  glucoseInRangePct: number
  adherencePct: number
  lifestyleAvg: number // 0..5 across mood/energy/sleep/stress(inverted)
  consistencyPct: number // days with ≥1 reading over last 14
  hasGlucoseData: boolean
  hasMedData: boolean
}

export function computeEirScore(input: ScoreInput): EirScore {
  const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)))
  const bp = clamp(input.bpInTargetPct * 0.85 + (30 - input.bpSeverityPenalty))
  const glucose = input.hasGlucoseData ? clamp(input.glucoseInRangePct) : 70
  const adherence = input.hasMedData ? clamp(input.adherencePct) : 80
  const lifestyle = clamp(((input.lifestyleAvg - 1) / 4) * 100)
  const consistency = clamp(input.consistencyPct)

  const components: ScoreComponent[] = [
    { key: 'bp', label: 'Blood pressure', weight: 0.3, value: bp, detail: `${input.bpInTargetPct}% of readings in target` },
    { key: 'glucose', label: 'Glucose', weight: 0.2, value: glucose, detail: input.hasGlucoseData ? `${input.glucoseInRangePct}% time in range` : 'no glucose data yet' },
    { key: 'meds', label: 'Medication', weight: 0.2, value: adherence, detail: input.hasMedData ? `${input.adherencePct}% adherence (14d)` : 'no medications tracked' },
    { key: 'lifestyle', label: 'Wellbeing', weight: 0.15, value: lifestyle, detail: `mood · energy · sleep · stress avg ${input.lifestyleAvg.toFixed(1)}/5` },
    { key: 'consistency', label: 'Consistency', weight: 0.15, value: consistency, detail: `${input.consistencyPct}% of days logged (14d)` },
  ]

  const total = Math.round(components.reduce((a, c) => a + c.value * c.weight, 0))
  const grade = total >= 85 ? 'excellent' : total >= 70 ? 'good' : total >= 55 ? 'fair' : 'attention'
  const gradeLabel = { excellent: 'Excellent', good: 'Good', fair: 'Fair', attention: 'Needs attention' }[grade]
  const weakest = [...components].filter((c) => c.weight >= 0.15).sort((a, b) => a.value - b.value)[0]
  const spark = weakest
    ? `Your ${weakest.label.toLowerCase()} is the current bottleneck — improving it moves this score the most.`
    : 'Keep logging to unlock your score.'
  return { total, grade, gradeLabel, components, spark }
}

/** Penalty for dangerous readings in the last 30 days (0..30). */
export function bpSeverityPenalty(distribution: Record<string, number>): number {
  const total = Object.values(distribution).reduce((a, b) => a + b, 0) || 1
  const crisis = (distribution.crisis ?? 0) / total
  const stage2 = (distribution.stage2 ?? 0) / total
  const stage1 = (distribution.stage1 ?? 0) / total
  return Math.min(30, Math.round(crisis * 100 + stage2 * 30 + stage1 * 8))
}
