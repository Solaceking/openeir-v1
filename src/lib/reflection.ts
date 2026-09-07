// OpenEir — Nightly Reflection.
// Once a day (after 21:00 by convention), Eir reviews the day — conversation,
// readings, adherence, journal — distills it into one semantic memory, and
// optionally writes a notable observation into the insight feed. Idempotent:
// one reflection per calendar day (AppSetting marker), force flag for the UI.

import { db } from '@/lib/db'
import { completeChat } from '@/lib/ai/providers'
import { normalizeKey, type MemoryKind } from '@/lib/memory'

function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10)
}

export interface ReflectionResult {
  date: string
  content: string
  created: boolean // false = already reflected today (no force)
  aiNarrated: boolean
  observation: string | null // pushed to the insight feed when notable
}

export async function getLastReflectionDate(): Promise<string | null> {
  const row = await db.appSetting.findUnique({ where: { key: 'memory.lastReflection' } })
  return row?.value ?? null
}

export async function runNightlyReflection(force = false): Promise<ReflectionResult> {
  const date = todayKey()
  if (!force) {
    const last = await getLastReflectionDate()
    if (last === date) return { date, content: '', created: false, aiNarrated: false, observation: null }
  }

  const [chats, bpToday, glToday, logsToday, life, meds] = await Promise.all([
    db.chatMessage.findMany({ where: { createdAt: { gte: new Date(`${date}T00:00:00.000Z`) } }, orderBy: { createdAt: 'asc' } }),
    db.bpReading.findMany({ where: { takenAt: { gte: new Date(`${date}T00:00:00.000Z`) } } }),
    db.glucoseReading.findMany({ where: { takenAt: { gte: new Date(`${date}T00:00:00.000Z`) } } }),
    db.medicationLog.findMany({ where: { date }, include: { medication: true } }),
    db.lifestyleLog.findUnique({ where: { date } }),
    db.medication.findMany({ where: { active: true } }),
  ])

  // Deterministic day facts
  const parts: string[] = []
  const taken = logsToday.filter((l) => l.status === 'taken').length
  const missed = logsToday.filter((l) => l.status === 'missed').length
  const pending = logsToday.filter((l) => l.status === 'pending').length
  const scheduledTotal = meds.reduce((n, m) => {
    try { return n + (JSON.parse(m.scheduleTimes) as string[]).length } catch { return n }
  }, 0)

  if (bpToday.length) {
    const sys = bpToday.map((r) => r.systolic)
    const dia = bpToday.map((r) => r.diastolic)
    parts.push(`logged ${bpToday.length} blood pressure reading${bpToday.length === 1 ? '' : 's'} (latest ${sys[sys.length - 1]} over ${dia[dia.length - 1]})`)
  }
  if (glToday.length) parts.push(`logged ${glToday.length} glucose reading${glToday.length === 1 ? '' : 's'}`)
  if (scheduledTotal > 0) {
    parts.push(`took ${taken} of ${scheduledTotal} scheduled dose${scheduledTotal === 1 ? '' : 's'}${missed ? `, missed ${missed}` : ''}${pending ? `, ${pending} still open` : ''}`)
  }
  if (life) {
    const bits: string[] = []
    if (life.sleepQuality) bits.push(`sleep ${life.sleepQuality}/5`)
    if (life.stress) bits.push(`stress ${life.stress}/5`)
    if (life.mood) bits.push(`mood ${life.mood}/5`)
    if (life.weightKg) bits.push(`weight ${life.weightKg} kg`)
    if (bits.length) parts.push(`journal: ${bits.join(', ')}`)
  }
  const userChats = chats.filter((c) => c.role === 'user')
  if (userChats.length) parts.push(`talked with you ${userChats.length} time${userChats.length === 1 ? '' : 's'}`)

  const factLine = parts.length
    ? `Nightly reflection ${date}: today the user ${parts.join('; ')}.`
    : `Nightly reflection ${date}: a quiet day — nothing was logged and no conversation happened.`

  // Notable observation → insight feed (only when something clearly needs a nudge)
  let observation: string | null = null
  if (scheduledTotal > 0 && missed >= 2 && pending === 0) {
    observation = `Missed ${missed} doses today. If today was unusual, no worry — if it keeps happening, tell Eir and adjust the plan together.`
  } else if (bpToday.some((r) => r.systolic >= 180 || r.diastolic >= 110)) {
    observation = 'A very high blood pressure was recorded today. If it repeats, contact your GP — and use SOS if you feel unwell.'
  }

  // Optional AI narration — best-effort, falls back to the deterministic line
  let content = factLine
  let aiNarrated = false
  const chatExcerpt = userChats.slice(-6).map((c) => c.content.slice(0, 160)).join(' | ')
  const ai = await completeChat('insight', [
    { role: 'system', content: 'You write one-sentence nightly reflections for a health companion app. Warm, factual, under 45 words, plain text, no emoji, no lists. Mention at most one gentle suggestion. Output ONLY the sentence.' },
    { role: 'user', content: `Day facts: ${factLine}${chatExcerpt ? `\nConversation excerpts: ${chatExcerpt}` : ''}` },
  ]).catch(() => null)
  if (ai?.ok && ai.text.trim().length > 20 && ai.text.length < 600) {
    content = `Nightly reflection ${date}: ${ai.text.trim().replace(/^["']|["']$/g, '')}`
    aiNarrated = true
  }

  // Store as semantic memory (dedupe by date key)
  const kind: MemoryKind = 'reflection'
  const key = normalizeKey(`nightly-reflection-${date}`)
  const existingReflection = await db.memoryEntry.findFirst({ where: { dedupeKey: key } })
  if (existingReflection) {
    await db.memoryEntry.update({ where: { id: existingReflection.id }, data: { content } })
  } else {
    await db.memoryEntry.create({
      data: { content, kind, tier: 'semantic', importance: 0.7, dedupeKey: key },
    })
  }

  if (observation) {
    await db.insight.create({
      data: { kind: 'summary', severity: 'low', title: `Evening note — ${date}`, body: observation, origin: 'rule' },
    }).catch(() => {})
  }

  await db.appSetting.upsert({
    where: { key: 'memory.lastReflection' },
    update: { value: date },
    create: { key: 'memory.lastReflection', value: date },
  })

  return { date, content, created: true, aiNarrated, observation }
}
