// OpenEir — data export (JSON/CSV) per type. Privacy-first: it's your data.
import { db } from '@/lib/db'
import { fail } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const toCsv = (headers: string[], rows: unknown[][]) =>
  [headers.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n')

export async function GET(req: Request) {
  const url = new URL(req.url)
  const type = url.searchParams.get('type') ?? 'all'
  const format = url.searchParams.get('format') ?? 'json'
  const stamp = new Date().toISOString().slice(0, 10)

  const [bp, gl, meds, logs, life, profile] = await Promise.all([
    db.bpReading.findMany({ orderBy: { takenAt: 'asc' } }),
    db.glucoseReading.findMany({ orderBy: { takenAt: 'asc' } }),
    db.medication.findMany({ orderBy: { createdAt: 'asc' } }),
    db.medicationLog.findMany({ orderBy: { createdAt: 'asc' } }),
    db.lifestyleLog.findMany({ orderBy: { date: 'asc' } }),
    db.profile.findFirst(),
  ])

  const medName = (id: string) => meds.find((m) => m.id === id)?.name ?? id

  if (format === 'csv') {
    let csv: string
    if (type === 'bp') {
      csv = toCsv(['taken_at', 'systolic', 'diastolic', 'pulse', 'arm', 'label', 'tags', 'notes', 'source'],
        bp.map((r) => [r.takenAt.toISOString(), r.systolic, r.diastolic, r.pulse, r.arm, r.label, r.tags, r.notes, r.source]))
    } else if (type === 'glucose') {
      csv = toCsv(['taken_at', 'value_mmol_l', 'context', 'carbs_g', 'tags', 'notes', 'source'],
        gl.map((r) => [r.takenAt.toISOString(), r.value, r.context, r.carbs, r.tags, r.notes, r.source]))
    } else if (type === 'medications') {
      csv = toCsv(['date', 'time', 'medication', 'status', 'actual_time', 'note'],
        logs.map((r) => [r.date, r.scheduledTime, medName(r.medicationId), r.status, r.actualTime, r.note]))
    } else {
      return fail('type must be bp|glucose|medications for CSV', 400)
    }
    return new Response(csv, {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="openeir-${type}-${stamp}.csv"` },
    })
  }

  return Response.json({
    app: 'OpenEir', version: 1, exportedAt: new Date().toISOString(),
    profile: profile ? { ...profile, conditions: JSON.parse(profile.conditions), prefs: JSON.parse(profile.prefs) } : null,
    bpReadings: bp, glucoseReadings: gl,
    medications: meds.map((m) => ({ ...m, scheduleTimes: JSON.parse(m.scheduleTimes) })),
    medicationLogs: logs, lifestyleLogs: life,
  }, {
    headers: { 'Content-Disposition': `attachment; filename="openeir-export-${stamp}.json"` },
  })
}
