// OpenEir — medication logic: interactions, refill prediction, schedule helpers

export interface MedLike {
  id: string
  name: string
  doseValue: number
  doseUnit: string
  stock?: number | null
  refillThreshold?: number | null
  scheduleTimes?: string | null
  purpose?: string | null
}

/** Conservative common-interaction table (educational, not medical advice). */
const INTERACTIONS: { a: RegExp; b: RegExp; note: string; level: 'info' | 'caution' | 'warning' }[] = [
  { a: /lisinopril|enalapril|ramipril|losartan|valsartan/i, b: /ibuprofen|naproxen|diclofenac|ketoprofen/i, level: 'warning', note: 'NSAIDs can blunt blood-pressure medication and strain the kidneys when combined with ACE inhibitors/ARBs. Ask your pharmacist about paracetamol/acetaminophen instead.' },
  { a: /lisinopril|enalapril|ramipril/i, b: /potassium|spironolactone/i, level: 'caution', note: 'ACE inhibitors raise potassium. Combined with potassium supplements or spironolactone, levels can climb too high — your doctor likely monitors this with blood tests.' },
  { a: /metformin/i, b: /prednisone|dexamethasone|hydrocortisone/i, level: 'caution', note: 'Corticosteroids raise blood glucose and can work against metformin. If you start a steroid course, expect higher readings for a while.' },
  { a: /metformin/i, b: /alcohol/i, level: 'caution', note: 'Heavy drinking with metformin raises the (rare) risk of lactic acidosis and can cause glucose swings.' },
  { a: /aspirin|warfarin|apixaban|rivaroxaban|clopidogrel/i, b: /ibuprofen|naproxen|diclofenac/i, level: 'warning', note: 'Combining blood thinners with NSAIDs significantly increases bleeding risk — avoid unless your doctor says otherwise.' },
]

export function checkInteractions(meds: { name: string }[]): { level: 'info' | 'caution' | 'warning'; note: string; pair: string }[] {
  const found: { level: 'info' | 'caution' | 'warning'; note: string; pair: string }[] = []
  for (let i = 0; i < meds.length; i++) {
    for (let j = i + 1; j < meds.length; j++) {
      for (const rule of INTERACTIONS) {
        const hitsA = rule.a.test(meds[i].name) || rule.b.test(meds[i].name)
        const hitsB = rule.a.test(meds[j].name) || rule.b.test(meds[j].name)
        const differentDrugs = !rule.a.test(meds[i].name) || !rule.b.test(meds[i].name)
        if (hitsA && hitsB && differentDrugs) {
          found.push({ level: rule.level, note: rule.note, pair: `${meds[i].name} + ${meds[j].name}` })
        }
      }
    }
  }
  return found
}

export function parseSchedule(scheduleTimes: string | null | undefined): string[] {
  try {
    const arr = JSON.parse(scheduleTimes ?? '[]')
    return Array.isArray(arr) ? arr.filter((t) => typeof t === 'string') : []
  } catch { return [] }
}

/** Doses per day across all active meds — used for refill prediction. */
export function dailyDoseCount(med: MedLike): number {
  return Math.max(1, parseSchedule(med.scheduleTimes).length)
}

export interface RefillPrediction {
  med: MedLike
  daysLeft: number | null
  refillBy: string | null
  urgent: boolean
}

export function predictRefill(med: MedLike, asOf = new Date()): RefillPrediction {
  const stock = med.stock
  const perDay = dailyDoseCount(med)
  if (stock === null || stock === undefined) return { med, daysLeft: null, refillBy: null, urgent: false }
  const daysLeft = Math.floor(stock / perDay)
  const refillByDate = new Date(asOf)
  refillByDate.setDate(refillByDate.getDate() + daysLeft)
  const threshold = med.refillThreshold ?? 7
  return {
    med,
    daysLeft,
    refillBy: refillByDate.toISOString().slice(0, 10),
    urgent: daysLeft <= threshold,
  }
}

/** Given today's schedule, build the dose timeline. */
export function todaySchedule(
  meds: MedLike[],
  logs: Map<string, string>, // `${medId}|${date}|${time}` -> status
  date: string,
): { med: MedLike; time: string; status: string }[] {
  const rows: { med: MedLike; time: string; status: string }[] = []
  for (const med of meds) {
    for (const time of parseSchedule(med.scheduleTimes)) {
      rows.push({ med, time, status: logs.get(`${med.id}|${date}|${time}`) ?? 'pending' })
    }
  }
  return rows.sort((a, b) => a.time.localeCompare(b.time))
}

export function missedDoseRecovery(scheduledTime: string, now = new Date()): { action: string; rationale: string } {
  const [h, m] = scheduledTime.split(':').map(Number)
  const scheduled = new Date(now)
  scheduled.setHours(h, m, 0, 0)
  const hoursLate = (now.getTime() - scheduled.getTime()) / 3600000
  if (hoursLate <= 4) {
    return { action: 'Take it now', rationale: 'You are within the safe window — take the dose as soon as you remember.' }
  }
  if (hoursLate <= 8) {
    return { action: 'Take it now, shift the next dose', rationale: 'Still safe for most once/twice-daily meds, but move the next dose later to keep spacing.' }
  }
  return { action: 'Skip this dose — never double up', rationale: 'It is too close to the next scheduled dose. Doubling up is risky; take the next one on time and note why this happened.' }
}
