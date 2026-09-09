// OpenEir — clinical report assembly, shared by:
//   GET /api/report          (json | html | pdf)
//   POST /api/report/email   (HTML body + PDF attachment via the user's SMTP)
// One source of truth for statistics, ordering and phrasing — the PDF, the
// printable HTML and the emailed copy can never drift apart.
import { db } from '@/lib/db'
import { bpStats, glucoseStats, adherenceStats, type BpPoint, type GlucosePoint } from '@/lib/health/stats'
import { computeEirScore, bpSeverityPenalty } from '@/lib/health/score'
import { categorizeBp } from '@/lib/health/bp'
import { buildHealthContext } from '@/lib/ai/context'
import { completeChat } from '@/lib/ai/providers'

export const REPORT_SECTIONS = ['summary', 'bp', 'glucose', 'meds', 'lifestyle', 'narrative', 'questions'] as const
export type ReportSection = (typeof REPORT_SECTIONS)[number]

const parse = <T,>(s: string | null | undefined, fb: T): tryResult<T> => {
  try {
    return s ? (JSON.parse(s) as T) : fb
  } catch {
    return fb
  }
}
type tryResult<T> = T

export interface ReportData {
  window: { from: string; to: string; days: number }
  patient: {
    name: string
    age: number | null
    conditions: string[]
    targets: { bp: string; glucose: string }
  }
  bp: ReturnType<typeof bpStats>
  glucose: ReturnType<typeof glucoseStats>
  adherence: ReturnType<typeof adherenceStats>
  score: ReturnType<typeof computeEirScore>
  medications: { name: string; dose: string; times: string[]; purpose: string }[]
  lifestyle: { mood: number | null; energy: number | null; sleep: number | null; stress: number | null }
  notable: BpPoint[]
  // raw rows for detail tables
  bpPoints: BpPoint[]
  hasGlucose: boolean
}

export async function buildReportData(opts: { from?: string | null; windowDays?: number }): Promise<ReportData> {
  const days = opts.from
    ? Math.ceil((Date.now() - new Date(opts.from).getTime()) / 86400000)
    : (opts.windowDays ?? 30)
  const window = Math.min(365, Math.max(7, days))

  const profileRow = await db.profile.findFirst()
  if (!profileRow) throw new Error('NO_PROFILE')

  const [bpRows, glRows, meds, logs, lifeRows] = await Promise.all([
    db.bpReading.findMany({ orderBy: { takenAt: 'desc' }, take: 1200 }),
    db.glucoseReading.findMany({ orderBy: { takenAt: 'desc' }, take: 1200 }),
    db.medication.findMany({ where: { active: true } }),
    db.medicationLog.findMany({ orderBy: { createdAt: 'desc' }, take: 1200 }),
    db.lifestyleLog.findMany({ orderBy: { date: 'desc' }, take: Math.min(120, window) }),
  ])

  const cutoff = Date.now() - window * 86400000
  const bpPoints: BpPoint[] = bpRows
    .filter((r) => r.takenAt.getTime() >= cutoff)
    .map((r) => ({
      id: r.id, systolic: r.systolic, diastolic: r.diastolic, pulse: r.pulse,
      takenAt: r.takenAt.toISOString(), label: r.label, tags: parse<string[]>(r.tags, []),
    }))
  const glPoints: GlucosePoint[] = glRows
    .filter((r) => r.takenAt.getTime() >= cutoff)
    .map((r) => ({ id: r.id, value: r.value, context: r.context, takenAt: r.takenAt.toISOString() }))

  const targets = { min: profileRow.glucoseTargetMin, max: profileRow.glucoseTargetMax }
  const bp = bpStats(bpPoints, profileRow.bpSystolicTarget, profileRow.bpDiastolicTarget, window)
  const gl = glucoseStats(glPoints, targets, window)
  const logRows = logs.map((l) => ({
    date: l.date, scheduledTime: l.scheduledTime, status: l.status,
    medicationName: meds.find((m) => m.id === l.medicationId)?.name,
  }))
  const adherence = adherenceStats(logRows, Math.min(30, window))
  const lifeAvg = (pick: 'mood' | 'energy' | 'sleepQuality' | 'stress') => {
    const vals = lifeRows.map((l) => l[pick]).filter((v): v is number => typeof v === 'number')
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null
  }

  const score = computeEirScore({
    bpInTargetPct: bp.inTargetPct,
    bpSeverityPenalty: bpSeverityPenalty(bp.distribution),
    glucoseInRangePct: gl.timeInRangePct,
    adherencePct: adherence.pct,
    lifestyleAvg: 3.5,
    consistencyPct: 100,
    hasGlucoseData: glPoints.length > 0,
    hasMedData: meds.length > 0,
  })

  return {
    window: {
      from: new Date(cutoff).toISOString().slice(0, 10),
      to: new Date().toISOString().slice(0, 10),
      days: window,
    },
    patient: {
      name: profileRow.fullName,
      age: profileRow.birthYear ? new Date().getFullYear() - profileRow.birthYear : null,
      conditions: parse<string[]>(profileRow.conditions, []),
      targets: {
        bp: `${profileRow.bpSystolicTarget}/${profileRow.bpDiastolicTarget}`,
        glucose: `${profileRow.glucoseTargetMin}–${profileRow.glucoseTargetMax} mmol/L`,
      },
    },
    bp, glucose: gl, adherence, score,
    medications: meds.map((m) => ({ name: m.name, dose: `${m.doseValue} ${m.doseUnit}`, times: parseSchedule(m.scheduleTimes), purpose: m.purpose ?? '' })),
    lifestyle: { mood: lifeAvg('mood'), energy: lifeAvg('energy'), sleep: lifeAvg('sleepQuality'), stress: lifeAvg('stress') },
    notable: bpPoints.filter((r) => ['stage2', 'crisis'].includes(categorizeBp(r.systolic, r.diastolic))).slice(0, 10),
    bpPoints,
    hasGlucose: glPoints.length > 0,
  }
}

/** AI "Summary" section — 90–130 words for the physician. Best effort, never throws. */
export async function buildNarrative(data: ReportData): Promise<string> {
  try {
    const ctx = await buildHealthContext()
    if (!ctx) return ''
    const result = await completeChat('report', [
      {
        role: 'system',
        content: 'You write the "Summary" section of a clinical home-monitoring report for the patient\'s physician. 90–130 words, factual third-person tone, citing the provided statistics. No diagnosis, no advice to the doctor beyond noting patterns. Plain text.',
      },
      {
        role: 'user',
        content: `Report window: ${data.window.days} days.\nStats: avg ${data.bp.avgSys}/${data.bp.avgDia} mmHg (${data.bp.count} readings), ${data.bp.inTargetPct}% in target, morning avg ${data.bp.morningAvgSys}, evening avg ${data.bp.eveningAvgSys}, adherence ${data.adherence.pct}%, glucose TIR ${data.glucose.timeInRangePct}%, est HbA1c ${data.glucose.estimatedHbA1c}%. Eir score ${data.score.total}/100. Slope ${data.bp.sysSlopePerDay} mmHg/day.`,
      },
    ])
    return result.ok ? result.text.trim() : ''
  } catch {
    return ''
  }
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function parseSchedule(scheduleTimes: string | null | undefined): string[] {
  try {
    const arr = JSON.parse(scheduleTimes ?? '[]')
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export function buildReportHtml(
  data: ReportData,
  opts: { sections: ReportSection[]; narrativeHtml?: string; generatedAt?: Date },
): string {
  const { bp, glucose: gl, adherence, score } = data
  const sections = opts.sections
  const now = opts.generatedAt ?? new Date()
  const rows = data.bpPoints.slice(0, 400).map((r) => {
    const cat = categorizeBp(r.systolic, r.diastolic)
    return `<tr><td>${new Date(r.takenAt).toLocaleString()}</td><td>${r.systolic}</td><td>${r.diastolic}</td><td>${r.pulse ?? '—'}</td><td>${esc(r.label ?? 'general')}</td><td>${cat}</td></tr>`
  }).join('')

  const narrativeHtml = opts.narrativeHtml
    ? `<h2>AI Summary</h2><div class="note"><p>${esc(opts.narrativeHtml)}</p></div>`
    : ''

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>OpenEir Report — ${esc(data.patient.name)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color: #111; margin: 0; font-size: 10.5pt; line-height: 1.45; }
  header { border-bottom: 3px solid #0f766e; padding-bottom: 10px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-end; }
  h1 { font-size: 17pt; margin: 0; color: #0f766e; letter-spacing: 0.3px; }
  .meta { font-size: 8.5pt; color: #555; text-align: right; }
  h2 { font-size: 11.5pt; color: #0f766e; border-bottom: 1px solid #d1d5db; padding-bottom: 3px; margin: 20px 0 8px; text-transform: uppercase; letter-spacing: 0.8px; }
  table { border-collapse: collapse; width: 100%; font-size: 8.5pt; }
  th, td { border: 1px solid #d1d5db; padding: 4px 7px; text-align: left; }
  th { background: #f0fdfa; color: #134e4a; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 6px 0; }
  .stat { border: 1px solid #d1d5db; border-radius: 6px; padding: 8px 10px; }
  .stat b { display: block; font-size: 13pt; color: #0f766e; }
  .stat span { font-size: 8pt; color: #555; text-transform: uppercase; letter-spacing: 0.5px; }
  .note { background: #f0fdfa; border-left: 3px solid #0f766e; padding: 8px 12px; margin: 10px 0; font-size: 9.5pt; }
  footer { margin-top: 24px; font-size: 7.5pt; color: #888; border-top: 1px solid #e5e7eb; padding-top: 6px; }
  @media print { .noprint { display: none } }
</style></head>
<body>
<header>
  <div><h1>Home Monitoring Report</h1><div style="font-size:9pt;color:#555">${esc(data.patient.name)}${data.patient.age ? `, ${data.patient.age}y` : ''} · ${data.patient.conditions.map(esc).join(', ') || '—'}</div></div>
  <div class="meta">Generated ${now.toLocaleString()}<br>Window: ${data.window.from} – ${data.window.to}<br>OpenEir (self-hosted)</div>
</header>
${sections.includes('summary') ? `<h2>Overview</h2>
<div class="grid">
  <div class="stat"><span>Avg BP (n=${bp.count})</span><b>${bp.avgSys}/${bp.avgDia} <small style="font-size:8pt;color:#666">mmHg</small></b></div>
  <div class="stat"><span>In target (${data.patient.targets.bp})</span><b>${bp.inTargetPct}%</b></div>
  <div class="stat"><span>Eir Score</span><b>${score.total}/100</b></div>
  ${data.hasGlucose ? `<div class="stat"><span>Glucose in range</span><b>${gl.timeInRangePct}%</b></div>
  <div class="stat"><span>Est. HbA1c</span><b>${gl.estimatedHbA1c}%</b></div>
  <div class="stat"><span>Fast / post-meal</span><b>${gl.avgFasting} / ${gl.avgPostMeal}</b></div>` : ''}
</div>` : ''}
${narrativeHtml}
${sections.includes('bp') ? `<h2>Blood Pressure Detail</h2>
<p style="font-size:9pt;margin:4px 0">Range ${bp.minSys}–${bp.maxSys} systolic · variability SD ${bp.stdSys} mmHg · morning ${bp.morningAvgSys} / evening ${bp.eveningAvgSys} · trend ${bp.sysSlopePerDay >= 0 ? '+' : ''}${bp.sysSlopePerDay} mmHg/day · pulse avg ${bp.avgPulse}</p>
<table><thead><tr><th>When</th><th>Systolic</th><th>Diastolic</th><th>Pulse</th><th>Label</th><th>Category</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
${sections.includes('meds') && data.medications.length ? `<h2>Medications & Adherence</h2>
<table><thead><tr><th>Medication</th><th>Dose</th><th>Schedule</th><th>Purpose</th></tr></thead><tbody>
${data.medications.map((m) => `<tr><td>${esc(m.name)}</td><td>${esc(m.dose)}</td><td>${m.times.map(esc).join(', ')}</td><td>${esc(m.purpose || '—')}</td></tr>`).join('')}
</tbody></table>
<p style="font-size:9.5pt">Adherence (last ${Math.min(30, data.window.days)} days): <b>${adherence.pct}%</b> — ${adherence.taken} taken, ${adherence.missed} missed, ${adherence.delayed} delayed, ${adherence.skipped} skipped of ${adherence.total} scheduled doses.</p>` : ''}
${sections.includes('glucose') && data.hasGlucose ? `<h2>Glucose</h2>
<p style="font-size:9.5pt">Mean ${gl.avg} mmol/L · time in range ${gl.timeInRangePct}% · below ${gl.belowPct}% · above ${gl.abovePct}% · SD ${gl.std} · n=${gl.count}</p>` : ''}
${sections.includes('questions') ? `<h2>Suggested questions for this visit</h2><ul style="font-size:9.5pt">
<li>My ${data.window.days}-day average is ${bp.avgSys}/${bp.avgDia} with ${bp.inTargetPct}% of readings at target — is my current treatment where you want it?</li>
${bp.sysSlopePerDay > 0.2 ? `<li>My readings have been trending up ~${bp.sysSlopePerDay} mmHg/day — should we adjust anything?</li>` : ''}
${adherence.pct < 90 ? `<li>I missed ${adherence.missed} doses this period — can we simplify my schedule?</li>` : ''}
${data.hasGlucose ? `<li>My estimated HbA1c is around ${gl.estimatedHbA1c}% — do you want a lab HbA1c to confirm?</li>` : ''}
<li>Which of these home readings would you like me to bring to future visits?</li>
</ul>` : ''}
<footer>Generated by OpenEir — self-hosted, privacy-first health tracking. Home readings are not a substitute for clinical measurement. AI summary is informational only.</footer>
<script>if (new URLSearchParams(location.search).get('autoprint') === '1') window.addEventListener('load', () => setTimeout(() => window.print(), 400))</script>
</body></html>`
}

/** Plain-text email body — the honest fallback when HTML is stripped. */
export function buildReportText(data: ReportData): string {
  const { bp, glucose: gl, adherence, score } = data
  const lines = [
    `HOME MONITORING REPORT — ${data.patient.name}${data.patient.age ? `, ${data.patient.age}y` : ''}`,
    `Window: ${data.window.from} to ${data.window.to} (${data.window.days} days)`,
    ``,
    `OVERVIEW`,
    `  Average BP: ${bp.avgSys}/${bp.avgDia} mmHg (n=${bp.count}), ${bp.inTargetPct}% in target (${data.patient.targets.bp})`,
    `  Eir score: ${score.total}/100`,
  ]
  if (data.hasGlucose) {
    lines.push(
      `  Glucose: mean ${gl.avg} mmol/L, time in range ${gl.timeInRangePct}%, est. HbA1c ${gl.estimatedHbA1c}%`,
    )
  }
  lines.push(
    ``,
    `MEDICATIONS (${data.medications.length})`,
    ...data.medications.map((m) => `  ${m.name} ${m.dose} — ${m.times.join(', ')}${m.purpose ? ` (${m.purpose})` : ''}`),
    ``,
    `ADHERENCE (last ${Math.min(30, data.window.days)} days): ${adherence.pct}% — ${adherence.taken} taken, ${adherence.missed} missed, ${adherence.delayed} delayed, ${adherence.skipped} skipped`,
    ``,
    `Generated by OpenEir — self-hosted, privacy-first health tracking.`,
    `Home readings are not a substitute for clinical measurement.`,
  )
  return lines.join('\n')
}
