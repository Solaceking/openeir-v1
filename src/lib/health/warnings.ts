// OpenEir — Early Warning System (predictive, rule-based, explainable)
// Detects developing problems BEFORE they become readings in the red.

export interface EarlyWarning {
  type: 'rising_trend' | 'variability_spike' | 'morning_surge' | 'adherence_drop' | 'glucose_rising' | 'hypo_risk'
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical'
  confidence: number // 0..1
  title: string
  body: string
  data: Record<string, unknown>
}

export function detectEarlyWarnings(input: {
  bp30: ReturnType<typeof import('./stats').bpStats>
  bp7: ReturnType<typeof import('./stats').bpStats>
  adherencePct14: number
  adherencePctPrev: number // 14 days before that
  glucose30: ReturnType<typeof import('./stats').glucoseStats>
  glucosePrev: ReturnType<typeof import('./stats').glucoseStats>
  hasGlucose: boolean
}): EarlyWarning[] {
  const out: EarlyWarning[] = []
  const { bp30, bp7, adherencePct14, adherencePctPrev, glucose30, glucosePrev, hasGlucose } = input

  // 1) Rising systolic trend — the classic silent precursor
  if (bp30.count >= 12 && bp30.sysSlopePerDay >= 0.35) {
    const projected = Math.round(bp30.avgSys + bp30.sysSlopePerDay * 14)
    out.push({
      type: 'rising_trend',
      severity: projected >= 140 ? 'high' : 'medium',
      confidence: Math.min(0.95, 0.5 + bp30.sysSlopePerDay),
      title: 'Your blood pressure is trending up',
      body: `Over the last ${Math.min(30, bp30.count)} days your systolic has climbed about ${bp30.sysSlopePerDay} mmHg per day. If this continues, two weeks from now you'd average around ${projected} mmHg — already Stage 2 territory. Worth reviewing sodium, stress and sleep now, and mentioning it at your next appointment.`,
      data: { slope: bp30.sysSlopePerDay, projected14d: projected, avgSys: bp30.avgSys },
    })
  }

  // 2) Variability spike — unstable control
  if (bp30.count >= 10 && bp30.stdSys >= 12 && bp30.stdSys > (bp7.count ? bp30.stdSys * 0.9 : 0)) {
    out.push({
      type: 'variability_spike',
      severity: 'low',
      confidence: 0.6,
      title: 'Your readings are swinging more than usual',
      body: `Your systolic standard deviation is ${bp30.stdSys} mmHg. Large swings can stress blood vessels as much as consistently high numbers. Look for patterns: missed doses, salty days, or poor sleep often show up here first.`,
      data: { std: bp30.stdSys },
    })
  }

  // 3) Morning surge
  if (bp30.morningAvgSys - bp30.eveningAvgSys >= 8) {
    out.push({
      type: 'morning_surge',
      severity: 'low',
      confidence: 0.55,
      title: 'Mornings run higher than evenings',
      body: `Your morning average is ${bp30.morningAvgSys} mmHg versus ${bp30.eveningAvgSys} in the evening — a ${bp30.morningAvgSys - bp30.eveningAvgSys} mmHg morning surge. Sleep quality and taking medication at a consistent time usually flatten this. Your body's cortisol peak matters too.`,
      data: { morning: bp30.morningAvgSys, evening: bp30.eveningAvgSys },
    })
  }

  // 4) Adherence dropped vs previous window
  if (adherencePct14 < adherencePctPrev - 10 && adherencePct14 < 90) {
    out.push({
      type: 'adherence_drop',
      severity: adherencePct14 < 75 ? 'high' : 'medium',
      confidence: 0.75,
      title: 'Medication adherence slipped',
      body: `You took ${adherencePct14}% of scheduled doses in the last two weeks, down from ${adherencePctPrev}% before that. Missed doses are the most common cause of creeping blood pressure — and the most fixable. Try pairing doses with a daily habit you never skip.`,
      data: { current: adherencePct14, previous: adherencePctPrev },
    })
  }

  // 5) Glucose creeping up
  if (hasGlucose && glucose30.count >= 8 && glucosePrev.count >= 8) {
    const delta = glucose30.avg - glucosePrev.avg
    if (delta >= 0.6) {
      out.push({
        type: 'glucose_rising',
        severity: delta >= 1.2 ? 'high' : 'medium',
        confidence: Math.min(0.9, 0.45 + delta / 3),
        title: 'Glucose averages are creeping up',
        body: `Your average glucose rose from ${glucosePrev.avg} to ${glucose30.avg} mmol/L between the last two 30-day windows. Estimated HbA1c is now around ${glucose30.estimatedHbA1c}%. Evening carbs and portion sizes at dinner are common drivers — the meal tags in your log can confirm it.`,
        data: { current: glucose30.avg, previous: glucosePrev.avg, hba1c: glucose30.estimatedHbA1c },
      })
    }
  }

  return out
}
