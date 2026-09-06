/**
 * OpenEir seed — 75 days of realistic, clinically-plausible data.
 * Deterministic (seeded RNG) so demos are reproducible.
 *
 *   bun run scripts/seed.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

// ---------- seeded RNG ----------
let s = 42
const rnd = () => {
  s = (s * 1103515245 + 12345) % 2147483648
  return s / 2147483648
}
const gauss = (mean: number, sd: number) => {
  const u = Math.max(rnd(), 1e-9), v = rnd()
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)]
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

const iso = (d: Date) => d.toISOString().slice(0, 10)
const DAYS = 75

async function main() {
  console.log('Seeding OpenEir demo data…')

  await db.bpReading.deleteMany()
  await db.glucoseReading.deleteMany()
  await db.medicationLog.deleteMany()
  await db.medication.deleteMany()
  await db.lifestyleLog.deleteMany()
  await db.insight.deleteMany()
  await db.eventRecord.deleteMany()
  await db.storyEntry.deleteMany()
  await db.whatIfScenario.deleteMany()
  await db.aiUsage.deleteMany()
  await db.aiProviderConfig.deleteMany()

  // ---------- profile ----------
  await db.profile.deleteMany()
  await db.profile.create({
    data: {
      fullName: 'Alex Morgan',
      birthYear: 1968,
      sex: 'male',
      heightCm: 178,
      conditions: JSON.stringify(['Hypertension', 'Type 2 Diabetes']),
      notes: 'Doctor visit scheduled at the end of the month.',
      bpSystolicTarget: 130,
      bpDiastolicTarget: 80,
      glucoseTargetMin: 4.4,
      glucoseTargetMax: 7.2,
      glucoseUnit: 'mmol',
      weightTargetKg: 80,
      onboarded: true,
      prefs: JSON.stringify({
        language: 'en',
        theme: 'system',
        largeText: false,
        highContrast: false,
        simpleMode: false,
        quietHours: { start: '22:00', end: '07:00', enabled: true },
        aiAutonomy: 'proactive',
        reminders: { bpMorning: '07:30', bpEvening: '19:30', glucoseFasting: '07:00' },
      }),
    },
  })

  // ---------- medications ----------
  const lisinopril = await db.medication.create({
    data: {
      name: 'Lisinopril',
      doseValue: 10,
      doseUnit: 'mg',
      form: 'tablet',
      purpose: 'Blood pressure',
      scheduleTimes: JSON.stringify(['08:00', '20:00']),
      instructions: 'Take with water. Avoid potassium supplements.',
      stock: 26,
      refillThreshold: 10,
      notes: 'Prescribed 2026-03-14, Dr. Okafor.',
    },
  })
  const metformin = await db.medication.create({
    data: {
      name: 'Metformin',
      doseValue: 500,
      doseUnit: 'mg',
      form: 'tablet',
      purpose: 'Type 2 diabetes',
      scheduleTimes: JSON.stringify(['08:00', '20:00']),
      instructions: 'Take with food to avoid stomach upset.',
      stock: 92,
      refillThreshold: 14,
    },
  })

  // ---------- readings ----------
  const bpRows: NonNullable<Parameters<typeof db.bpReading.createMany>[0]>['data'] = []
  const glRows: NonNullable<Parameters<typeof db.glucoseReading.createMany>[0]>['data'] = []
  const lifeRows: NonNullable<Parameters<typeof db.lifestyleLog.createMany>[0]>['data'] = []
  const medLogRows: NonNullable<Parameters<typeof db.medicationLog.createMany>[0]>['data'] = []

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const dow = d.getDay()
    const dayIdx = DAYS - 1 - i
    const weekend = dow === 0 || dow === 6

    // ---- lifestyle ----
    const sleepQuality = Math.round(clamp(gauss(weekend ? 3.8 : 3.2, 1.0), 1, 5))
    const stress = Math.round(clamp(gauss(weekend ? 2.2 : 3.1, 0.9), 1, 5))
    const mood = Math.round(clamp(gauss(weekend ? 4.2 : 3.5, 0.8), 1, 5))
    const energy = Math.round(clamp(gauss(weekend ? 4.0 : 3.3, 0.8), 1, 5))
    const weight = clamp(84.4 - (DAYS - dayIdx) * 0.02 + gauss(0, 0.25), 80, 86)
    const sodiumHigh = weekend && rnd() < 0.55
    lifeRows.push({
      date: iso(d),
      mood, energy, sleepQuality, stress,
      weightKg: Math.round(weight * 10) / 10,
      sodiumHigh,
    })

    // ---- physiology model for the day ----
    // baseline rises gently in the last 3 weeks (early-warning fodder)
    const trendUp = dayIdx > DAYS - 22 ? (dayIdx - (DAYS - 22)) * 0.22 : 0
    let sbpBase = 124 + trendUp
    let diaBase = 79 + trendUp * 0.45
    let nextMorningExtra = 0
    if (sleepQuality <= 2) nextMorningExtra += 8
    if (stress >= 4) { sbpBase += 6; diaBase += 3 }
    if (sodiumHigh) { sbpBase += 5; diaBase += 2 }

    // the "rough stretch": days 40-43 missed meds + illness
    const rough = dayIdx >= 40 && dayIdx <= 43
    if (rough) { sbpBase += 13; diaBase += 7 }

    // ---- BP: morning + evening ----
    const exerciseTag = rnd() < (weekend ? 0.5 : 0.3)
    for (const [slot, hour] of [['morning', 7], ['evening', 19]] as const) {
      const at = new Date(d)
      at.setHours(hour, Math.floor(rnd() * 45) + 5, 0, 0)
      let sbp = sbpBase + gauss(0, 4.5)
      let dia = diaBase + gauss(0, 3.2)
      let pulse = Math.round(gauss(68, 5))
      const tags: string[] = []
      if (slot === 'morning') {
        sbp += nextMorningExtra * 0.7
        if (sleepQuality <= 2) tags.push('poor-sleep')
      } else {
        sbp += 2 // evening slightly higher
        if (sodiumHigh) tags.push('high-sodium')
      }
      if (rough) tags.push('illness')
      if (stress >= 4) tags.push('stress')
      if (exerciseTag && slot === 'evening') {
        sbp -= 6; dia -= 3; pulse += 7
        tags.push('exercise')
      }
      if (weekend && slot === 'morning') at.setHours(8, Math.floor(rnd() * 50) + 10)

      sbp = Math.round(clamp(sbp, 96, 185))
      dia = Math.round(clamp(dia, 58, 115))
      bpRows.push({
        systolic: sbp,
        diastolic: dia,
        pulse,
        arm: 'left',
        label: slot === 'morning' ? 'morning' : 'evening',
        tags: JSON.stringify(tags),
        notes: rough && slot === 'morning' ? 'Felt unwell, headache.' : null,
        source: 'manual',
        takenAt: at,
      })
    }

    // ---- glucose ----
    const fasting = clamp(gauss(5.7 + trendUp * 0.02 + (rough ? 0.9 : 0) + (sleepQuality <= 2 ? 0.5 : 0), 0.55), 3.9, 9.4)
    glRows.push({
      value: Math.round(fasting * 10) / 10,
      context: 'fasting',
      carbs: null as unknown as number,
      tags: JSON.stringify([]),
      source: 'manual',
      takenAt: (() => { const t = new Date(d); t.setHours(7, 10, 0, 0); return t })(),
    })
    if (rnd() < 0.75) {
      const post = clamp(gauss(7.4 + (rough ? 1.1 : 0), 1.1), 4.2, 12.5)
      glRows.push({
        value: Math.round(post * 10) / 10,
        context: 'post_meal',
        carbs: Math.round(clamp(gauss(62, 18), 15, 130)),
        tags: JSON.stringify(pick([[], ['dessert'], ['eating-out', 'high-carb'], ['home-cooked']])),
        source: 'manual',
        takenAt: (() => { const t = new Date(d); t.setHours(13, 30, 0, 0); return t })(),
      })
    }
    if (rnd() < 0.4) {
      glRows.push({
        value: Math.round(clamp(gauss(6.3, 0.8), 4.0, 10.2) * 10) / 10,
        context: 'bedtime',
        tags: JSON.stringify([]),
        source: 'manual',
        takenAt: (() => { const t = new Date(d); t.setHours(22, 15, 0, 0); return t })(),
      })
    }

    // ---- medication logs ----
    for (const med of [lisinopril, metformin]) {
      for (const t of ['08:00', '20:00']) {
        let status = 'taken'
        if (i === 0 && t === '20:00') status = 'pending' // tonight's dose still ahead
        else if (rough && rnd() < 0.7) status = 'missed'
        else if (rnd() < 0.045) status = 'missed'
        else if (rnd() < 0.03) status = 'delayed'
        else if (rnd() < 0.012) status = 'skipped'
        medLogRows.push({
          medicationId: med.id,
          date: iso(d),
          scheduledTime: t,
          status,
          actualTime: status === 'taken' ? t : status === 'delayed' ? '21:15' : null,
          note: rough ? 'Felt too unwell to keep track.' : null,
        })
      }
    }
  }

  await db.bpReading.createMany({ data: bpRows })
  await db.glucoseReading.createMany({ data: glRows })
  await db.lifestyleLog.createMany({ data: lifeRows })
  await db.medicationLog.createMany({ data: medLogRows })


  // ---------- built-in AI provider ----------
  await db.aiProviderConfig.create({
    data: {
      label: 'OpenEir Built-in AI',
      adapter: 'builtin_zai',
      model: 'glm-5.3-flash',
      enabled: true,
      isDefault: true,
      priority: 10,
      privacyMode: false,
    },
  })

  console.log(`Seeded: ${bpRows.length} BP readings, ${glRows.length} glucose readings, ${lifeRows.length} lifestyle logs, ${medLogRows.length + 4} medication logs.`)
  console.log('Done.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
