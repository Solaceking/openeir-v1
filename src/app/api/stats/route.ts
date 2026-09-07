// OpenEir — one aggregate call that powers the dashboard.
import { db } from '@/lib/db'
import { ok } from '@/lib/api-utils'
import { bpStats, glucoseStats, adherenceStats, loggingStreak, type BpPoint, type GlucosePoint } from '@/lib/health/stats'
import { computeEirScore, bpSeverityPenalty } from '@/lib/health/score'
import { detectEarlyWarnings } from '@/lib/health/warnings'
import { parseSchedule, todaySchedule, predictRefill, checkInteractions } from '@/lib/health/meds'
import { emitEvent } from '@/lib/events'

export const dynamic = 'force-dynamic'

const parse = <T,>(s: string | null | undefined, fb: T): T => { try { return s ? JSON.parse(s) as T : fb } catch { return fb } }

export async function GET() {
  const profileRow = (await db.profile.findFirst()) ?? (await db.profile.create({ data: {} }))
  // passive presence heartbeat — lets companions see "app active X min ago"
  void db.appSetting.upsert({
    where: { key: 'last_app_open' },
    update: { value: new Date().toISOString() },
    create: { key: 'last_app_open', value: new Date().toISOString() },
  }).catch(() => {})
  const [bpRows, glRows, meds, logs, lifeRows] = await Promise.all([
    db.bpReading.findMany({ orderBy: { takenAt: 'desc' }, take: 400 }),
    db.glucoseReading.findMany({ orderBy: { takenAt: 'desc' }, take: 400 }),
    db.medication.findMany({ where: { active: true }, orderBy: { createdAt: 'asc' } }),
    db.medicationLog.findMany({ orderBy: { createdAt: 'desc' }, take: 800 }),
    db.lifestyleLog.findMany({ orderBy: { date: 'desc' }, take: 45 }),
  ])

  const bpPoints: BpPoint[] = bpRows.map((r) => ({
    id: r.id, systolic: r.systolic, diastolic: r.diastolic, pulse: r.pulse,
    takenAt: r.takenAt.toISOString(), label: r.label, tags: parse<string[]>(r.tags, []),
  }))
  const glPoints: GlucosePoint[] = glRows.map((r) => ({
    id: r.id, value: r.value, context: r.context, carbs: r.carbs, takenAt: r.takenAt.toISOString(),
  }))

  const targets = { min: profileRow.glucoseTargetMin, max: profileRow.glucoseTargetMax }
  const bp30 = bpStats(bpPoints, profileRow.bpSystolicTarget, profileRow.bpDiastolicTarget, 30)
  const bp90 = bpStats(bpPoints, profileRow.bpSystolicTarget, profileRow.bpDiastolicTarget, 90)
  const gl30 = glucoseStats(glPoints, targets, 30)

  const logRows = logs.map((l) => ({
    date: l.date, scheduledTime: l.scheduledTime, status: l.status,
    medicationName: meds.find((m) => m.id === l.medicationId)?.name,
  }))
  const adherence = adherenceStats(logRows, 14)
  const adherencePrev = adherenceStats(
    logRows.filter((l) => l.date < new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)), 14,
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
    glucosePrev: glucoseStats(glPoints, targets, 60),
    hasGlucose: glPoints.length > 0,
  })

  const todayIso = new Date().toISOString().slice(0, 10)
  const logMap = new Map<string, string>()
  for (const l of logs) logMap.set(`${l.medicationId}|${l.date}|${l.scheduledTime}`, l.status)
  const schedule = todaySchedule(meds, logMap, todayIso)

  const refills = meds.map((m) => predictRefill(m)).filter((r) => r.daysLeft !== null)

  const lastReading = bpPoints[0] ?? null

  // quiet ambient maintenance: engagement drop detection
  if (lastReading) {
    const gapDays = (Date.now() - new Date(lastReading.takenAt).getTime()) / 86400000
    if (gapDays > 3) void emitEvent('PATTERN_CHECK', { gapDays: Math.round(gapDays) }, 'low')
  }

  return ok({
    profile: {
      id: profileRow.id,
      fullName: profileRow.fullName,
      sysTarget: profileRow.bpSystolicTarget,
      diaTarget: profileRow.bpDiastolicTarget,
      glucoseMin: profileRow.glucoseTargetMin,
      glucoseMax: profileRow.glucoseTargetMax,
      glucoseUnit: profileRow.glucoseUnit,
      weightTargetKg: profileRow.weightTargetKg,
      prefs: parse(profileRow.prefs, {}),
      onboarded: profileRow.onboarded,
    },
    today: new Date().toISOString(),
    lastReading: lastReading && {
      ...lastReading,
      systolic: lastReading.systolic, diastolic: lastReading.diastolic,
    },
    bp30, bp90, gl30,
    adherence,
    score,
    warnings,
    streakDays: loggingStreak(loggedDays),
    schedule: schedule.map((s) => ({
      medicationId: s.med.id, medicationName: s.med.name,
      dose: `${s.med.doseValue}${s.med.doseUnit}`, time: s.time, status: s.status,
    })),
    refills,
    interactions: checkInteractions(meds.map((m) => ({ name: m.name }))),
    lifestyle14d: life14.map((l) => ({
      date: l.date, mood: l.mood, energy: l.energy, sleepQuality: l.sleepQuality,
      stress: l.stress, weightKg: l.weightKg, sodiumHigh: l.sodiumHigh,
    })),
    dailyBp: bpPoints
      .filter((r) => Date.now() - new Date(r.takenAt).getTime() < 30 * 86400000)
      .map((r) => ({ at: r.takenAt, sys: r.systolic, dia: r.diastolic, pulse: r.pulse, label: r.label }))
      .reverse(),
    dailyGlucose: glPoints
      .filter((r) => Date.now() - new Date(r.takenAt).getTime() < 30 * 86400000)
      .map((r) => ({ at: r.takenAt, value: r.value, context: r.context }))
      .reverse(),
    medSchedules: meds.map((m) => ({ id: m.id, name: m.name, times: parseSchedule(m.scheduleTimes) })),
  })
}
