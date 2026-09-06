// OpenEir — report/export endpoints
// GET /api/report?from&to&format=json  → structured payload for the report builder
// GET /api/report?from&to&format=html  → print-ready clinical HTML document
import { db } from '@/lib/db'
import { fail } from '@/lib/api-utils'
import { bpStats, glucoseStats, adherenceStats, type BpPoint, type GlucosePoint } from '@/lib/health/stats'
import { computeEirScore, bpSeverityPenalty } from '@/lib/health/score'
import { categorizeBp, BP_CATEGORIES } from '@/lib/health/bp'
import { buildHealthContext } from '@/lib/ai/context'
import { completeChat } from '@/lib/ai/providers'
import { emitEvent } from '@/lib/events'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const parse = <T,>(s: string | null | undefined, fb: T): T => { try { return s ? JSON.parse(s) as T : fb } catch { return fb } }
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export async function GET(req: Request) {
  const url = new URL(req.url)
  const format = url.searchParams.get('format') ?? 'json'
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const sections = (url.searchParams.get('sections') ?? 'summary,bp,glucose,meds,lifestyle,narrative,questions').split(',')

  const days = from ? Math.ceil((Date.now() - new Date(from).getTime()) / 86400000) : 30
  const window = Math.min(365, Math.max(7, days))

  const profileRow = await db.profile.findFirst()
  if (!profileRow) return fail('Complete setup first', 400)

  const [bpRows, glRows, meds, logs, lifeRows] = await Promise.all([
    db.bpReading.findMany({ orderBy: { takenAt: 'desc' }, take: 1200 }),
    db.glucoseReading.findMany({ orderBy: { takenAt: 'desc' }, take: 1200 }),
    db.medication.findMany({ where: { active: true } }),
    db.medicationLog.findMany({ orderBy: { createdAt: 'desc' }, take: 1200 }),
    db.lifestyleLog.findMany({ orderBy: { date: 'desc' }, take: Math.min(120, window) }),
  ])

  const cutoff = Date.now() - window * 86400000
  const bpPoints: BpPoint[] = bpRows.filter((r) => r.takenAt.getTime() >= cutoff).map((r) => ({
    id: r.id, systolic: r.systolic, diastolic: r.diastolic, pulse: r.pulse,
    takenAt: r.takenAt.toISOString(), label: r.label, tags: parse<string[]>(r.tags, []),
  }))
  const glPoints: GlucosePoint[] = glRows.filter((r) => r.takenAt.getTime() >= cutoff).map((r) => ({
    id: r.id, value: r.value, context: r.context, takenAt: r.takenAt.toISOString(),
  }))

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

  void emitEvent('REPORT_VIEWED', { window }, 'low')

  if (format === 'json') {
    return Response.json({
      generatedAt: new Date().toISOString(),
      window: { from: new Date(cutoff).toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10), days: window },
      patient: {
        name: profileRow.fullName, age: profileRow.birthYear ? new Date().getFullYear() - profileRow.birthYear : null,
        conditions: parse<string[]>(profileRow.conditions, []),
        targets: { bp: `${profileRow.bpSystolicTarget}/${profileRow.bpDiastolicTarget}`, glucose: `${profileRow.glucoseTargetMin}–${profileRow.glucoseTargetMax} mmol/L` },
      },
      bp, glucose: gl, adherence, score,
      medications: meds.map((m) => ({ name: m.name, dose: `${m.doseValue} ${m.doseUnit}`, times: parseSchedule(m.scheduleTimes), purpose: m.purpose })),
      lifestyle: { mood: lifeAvg('mood'), energy: lifeAvg('energy'), sleep: lifeAvg('sleepQuality'), stress: lifeAvg('stress') },
      notable: bpPoints.filter((r) => ['stage2', 'crisis'].includes(categorizeBp(r.systolic, r.diastolic))).slice(0, 10),
    })
  }

  if (format === 'html') {
    let narrativeHtml = ''
    if (sections.includes('narrative')) {
      const ctx = await buildHealthContext()
      if (ctx) {
        const result = await completeChat('report', [
          {
            role: 'system',
            content: 'You write the "Summary" section of a clinical home-monitoring report for the patient\'s physician. 90–130 words, factual third-person tone, citing the provided statistics. No diagnosis, no advice to the doctor beyond noting patterns. Plain text.',
          },
          { role: 'user', content: `Report window: ${window} days.\nStats: avg ${bp.avgSys}/${bp.avgDia} mmHg (${bp.count} readings), ${bp.inTargetPct}% in target, morning avg ${bp.morningAvgSys}, evening avg ${bp.eveningAvgSys}, adherence ${adherence.pct}%, glucose TIR ${gl.timeInRangePct}%, est HbA1c ${gl.estimatedHbA1c}%. Eir score ${score.total}/100. Slope ${bp.sysSlopePerDay} mmHg/day.` },
        ])
        narrativeHtml = result.ok ? `<p>${esc(result.text.trim())}</p>` : ''
      }
    }

    const rows = bpPoints.slice(0, 400).map((r) => {
      const cat = categorizeBp(r.systolic, r.diastolic)
      return `<tr><td>${new Date(r.takenAt).toLocaleString()}</td><td>${r.systolic}</td><td>${r.diastolic}</td><td>${r.pulse ?? '—'}</td><td>${esc(r.label ?? 'general')}</td><td>${BP_CATEGORIES[cat].label}</td></tr>`
    }).join('')

    const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>OpenEir Report — ${esc(profileRow.fullName)}</title>
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
  <div><h1>Home Monitoring Report</h1><div style="font-size:9pt;color:#555">${esc(profileRow.fullName)}${profileRow.birthYear ? `, ${new Date().getFullYear() - profileRow.birthYear}y` : ''} · ${parse<string[]>(profileRow.conditions, []).map(esc).join(', ') || '—'}</div></div>
  <div class="meta">Generated ${new Date().toLocaleString()}<br>Window: ${new Date(cutoff).toLocaleDateString()} – ${new Date().toLocaleDateString()}<br>OpenEir (self-hosted)</div>
</header>
${sections.includes('summary') ? `<h2>Overview</h2>
<div class="grid">
  <div class="stat"><span>Avg BP (n=${bp.count})</span><b>${bp.avgSys}/${bp.avgDia} <small style="font-size:8pt;color:#666">mmHg</small></b></div>
  <div class="stat"><span>In target (${profileRow.bpSystolicTarget}/${profileRow.bpDiastolicTarget})</span><b>${bp.inTargetPct}%</b></div>
  <div class="stat"><span>Eir Score</span><b>${score.total}/100</b></div>
  ${glPoints.length ? `<div class="stat"><span>Glucose in range</span><b>${gl.timeInRangePct}%</b></div>
  <div class="stat"><span>Est. HbA1c</span><b>${gl.estimatedHbA1c}%</b></div>
  <div class="stat"><span>Fast / post-meal</span><b>${gl.avgFasting} / ${gl.avgPostMeal}</b></div>` : ''}
</div>` : ''}
${narrativeHtml ? `<h2>AI Summary</h2><div class="note">${narrativeHtml}</div>` : ''}
${sections.includes('bp') ? `<h2>Blood Pressure Detail</h2>
<p style="font-size:9pt;margin:4px 0">Range ${bp.minSys}–${bp.maxSys} systolic · variability σ ${bp.stdSys} mmHg · morning ${bp.morningAvgSys} / evening ${bp.eveningAvgSys} · trend ${bp.sysSlopePerDay >= 0 ? '+' : ''}${bp.sysSlopePerDay} mmHg/day · pulse avg ${bp.avgPulse}</p>
<table><thead><tr><th>When</th><th>Systolic</th><th>Diastolic</th><th>Pulse</th><th>Label</th><th>Category</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
${sections.includes('meds') && meds.length ? `<h2>Medications & Adherence</h2>
<table><thead><tr><th>Medication</th><th>Dose</th><th>Schedule</th><th>Purpose</th></tr></thead><tbody>
${meds.map((m) => `<tr><td>${esc(m.name)}</td><td>${m.doseValue} ${esc(m.doseUnit)}</td><td>${parseSchedule(m.scheduleTimes).join(', ')}</td><td>${esc(m.purpose ?? '—')}</td></tr>`).join('')}
</tbody></table>
<p style="font-size:9.5pt">Adherence (last ${Math.min(30, window)} days): <b>${adherence.pct}%</b> — ${adherence.taken} taken, ${adherence.missed} missed, ${adherence.delayed} delayed, ${adherence.skipped} skipped of ${adherence.total} scheduled doses.</p>` : ''}
${sections.includes('glucose') && glPoints.length ? `<h2>Glucose</h2>
<p style="font-size:9.5pt">Mean ${gl.avg} mmol/L · time in range ${gl.timeInRangePct}% · below ${gl.belowPct}% · above ${gl.abovePct}% · σ ${gl.std} · n=${gl.count}</p>` : ''}
${sections.includes('questions') ? `<h2>Suggested questions for this visit</h2><ul style="font-size:9.5pt">
<li>My 30-day average is ${bp.avgSys}/${bp.avgDia} with ${bp.inTargetPct}% of readings at target — is my current treatment where you want it?</li>
${bp.sysSlopePerDay > 0.2 ? `<li>My readings have been trending up ~${bp.sysSlopePerDay} mmHg/day — should we adjust anything?</li>` : ''}
${adherence.pct < 90 ? `<li>I missed ${adherence.missed} doses this period — can we simplify my schedule?</li>` : ''}
${glPoints.length ? `<li>My estimated HbA1c is around ${gl.estimatedHbA1c}% — do you want a lab HbA1c to confirm?</li>` : ''}
<li>Which of these home readings would you like me to bring to future visits?</li>
</ul>` : ''}
<footer>Generated by OpenEir — self-hosted, privacy-first health tracking. Home readings are not a substitute for clinical measurement. AI summary is informational only.</footer>
<script>if (new URLSearchParams(location.search).get('autoprint') === '1') window.addEventListener('load', () => setTimeout(() => window.print(), 400))</script>
</body></html>`
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  return fail('Unknown format', 400)
}

function parseSchedule(scheduleTimes: string | null | undefined): string[] {
  try {
    const arr = JSON.parse(scheduleTimes ?? '[]')
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}
