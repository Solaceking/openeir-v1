// OpenEir — the conversation core. One persistent, WhatsApp-style thread with
// Eir, grounded in the FULL health context (same builder as every AI feature).
//
// Deterministic intake: user text is ALSO run through the voice command parser
// (same one the mic uses). When it confidently detects a blood pressure,
// glucose or medication-taken intent, the API returns a structured "action"
// the UI renders as an in-chat confirmation card — nothing is ever logged
// without an explicit confirm, mirroring the voice/OCR safety philosophy.
// The LLM is told what was detected so it acknowledges naturally, but the
// data path never depends on the LLM inventing structure.

import { db } from '@/lib/db'
import { ok, fail, parseBody, rateLimit, clientKey } from '@/lib/api-utils'
import { z } from 'zod'
import { buildHealthContext, contextForPrompt } from '@/lib/ai/context'
import { completeChat } from '@/lib/ai/providers'
import { parseVoiceCommand } from '@/lib/voice/parser'
import { readbackFor } from '@/lib/voice/types'
import { parseSchedule } from '@/lib/health/meds'
import { retrieveMemories, memoriesForPrompt, extractDeterministic, storeMemories, aiExtract } from '@/lib/memory'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const postSchema = z.object({
  text: z.string().trim().min(1).max(1200),
  channel: z.enum(['text', 'voice']).default('text'),
})

const HISTORY_LIMIT = 16

interface DetectedAction {
  kind: 'bp' | 'glucose' | 'med'
  confidence: number
  readback: string
  // bp
  systolic?: number
  diastolic?: number
  pulse?: number | null
  label?: string
  takenAt?: string
  // glucose
  value?: number
  context?: string
  heardUnit?: string
  // med
  medicationId?: string
  medName?: string
  medStatus?: 'taken' | 'skipped'
  scheduledTime?: string
  doseText?: string
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Snap "I took it around 8" style times to the med's real schedule slot. */
function snapSlot(scheduleTimes: string[], time: string | null | undefined): string {
  const slots = parseSchedule(JSON.stringify(scheduleTimes ?? []))
  if (!time) return slots[0] ?? '08:00'
  if (slots.includes(time)) return time
  const [h, m] = time.split(':').map(Number)
  if (Number.isNaN(h)) return slots[0] ?? '08:00'
  let best = slots[0] ?? '08:00'
  let bestDiff = Number.POSITIVE_INFINITY
  for (const s of slots) {
    const [sh, sm] = s.split(':').map(Number)
    const diff = Math.abs(sh * 60 + sm - (h * 60 + (m || 0)))
    if (diff < bestDiff) { bestDiff = diff; best = s }
  }
  return best
}

/** Detect loggable health intents deterministically — never trust the LLM for data. */
async function detectAction(text: string): Promise<DetectedAction | null> {
  let intent
  try {
    intent = parseVoiceCommand(text)
  } catch {
    return null
  }
  if (intent.kind === 'unknown' || intent.confidence < 0.55) return null

  if (intent.fields.kind === 'bp') {
    const f = intent.fields
    return {
      kind: 'bp', confidence: intent.confidence, readback: readbackFor(intent),
      systolic: f.systolic, diastolic: f.diastolic, pulse: f.pulse ?? null,
      label: f.label, takenAt: f.takenAt,
    }
  }
  if (intent.fields.kind === 'glucose') {
    const f = intent.fields
    return {
      kind: 'glucose', confidence: intent.confidence, readback: readbackFor(intent),
      value: f.value, context: f.context, heardUnit: f.heardUnit, takenAt: f.takenAt,
    }
  }
  if (intent.fields.kind === 'med_taken' || intent.fields.kind === 'med_skipped') {
    const f = intent.fields
    const meds = await db.medication.findMany({ where: { active: true } })
    const heard = normalizeName(f.nameHeard)
    const med = meds.find((m) => normalizeName(m.name) === heard)
      ?? meds.find((m) => normalizeName(m.name).includes(heard) || heard.includes(normalizeName(m.name)))
    if (!med) return null
    const slots = parseSchedule(med.scheduleTimes)
    return {
      kind: 'med', confidence: intent.confidence, readback: readbackFor(intent),
      medicationId: med.id, medName: med.name, medStatus: f.kind === 'med_taken' ? 'taken' : 'skipped',
      scheduledTime: snapSlot(slots, f.time ?? undefined),
      doseText: f.doseHeard ? `${f.doseHeard.value} ${f.doseHeard.unit}` : `${med.doseValue} ${med.doseUnit}`,
    }
  }
  return null
}

function systemPrompt(ctx: NonNullable<Awaited<ReturnType<typeof buildHealthContext>>>, detected: DetectedAction | null, memoriesBlock: string, channel: 'text' | 'voice'): string {
  // 'live' = the words arrived through the live spoken session (channel voice).
  // Text messages land here too (typed), so the honest default is text-only.
  const voiceContext: 'live' | 'text' = channel === 'voice' ? 'live' : 'text'
  const lines = [
    'You are Eir, the warm, precise AI health companion inside the user\'s self-hosted OpenEir app (a blood-pressure / glucose / medication companion).',
    'This is a live conversation, WhatsApp-style. Write like a caring, highly competent friend who happens to read clinical data: short paragraphs, plain text, NO markdown headings, NO bullet lists, NO emoji.',
    'Keep replies under 110 words unless the user explicitly asks for depth. Use their actual numbers when relevant. Ask at most one gentle follow-up question when it helps.',
    'You are NOT a doctor and never diagnose. For symptoms that may be urgent (chest pain, severe breathlessness, fainting, stroke signs), tell them plainly to seek emergency care now.',
    'You may gently encourage habits and adherence, celebrate streaks, and explain what their numbers mean in plain language. Never invent numbers you were not given.',
    voiceContext === 'live'
      ? 'You DO have a voice: in Talk\'s live mode the user speaks to you out loud and everything you say is read aloud with a neural voice, and you hear them through speech-to-text. If asked whether you can hear or speak: yes, honestly — and your voice is synthesized.'
      : 'Voice status: right now you are TEXT-ONLY for the user in this view — live speech may be unavailable on their device or the speech backend may be down. If asked whether you can hear or speak, be honest: not in this moment — typed messages work, and they can enable live voice from the Talk tab (or Settings → AI providers if transcription is failing). Never claim to hear them when the message arrived as text.',
  ]
  if (channel === 'voice') {
    lines.push(
      'You are in a LIVE SPOKEN conversation right now: the user is talking to you out loud, and your words are read aloud sentence by sentence as they arrive.',
      'The user\'s words arrive via speech recognition, so small transcription mistakes are normal — flow with them, and confirm any number before treating it as data.',
      'Write for the EAR: short speakable sentences, plain everyday words, no markdown, no lists, no emoji, no parentheses or symbols that sound odd when read aloud. Keep it under 90 words.',
      'The user may interrupt you mid-sentence; if cut off, stop gracefully and listen. Do not repeat yourself after an interruption.',
    )
  }
  if (memoriesBlock) {
    lines.push(
      `\nThings you remember about the user from previous conversations (use naturally when relevant — do not recite this list, and never claim to remember what is not here):\n${memoriesBlock}`,
    )
  }
  if (detected) {
    lines.push(
      `The app has ALREADY detected from the user's last message: ${detected.readback} A confirmation card is shown in the chat — acknowledge it warmly in one short clause (e.g. "Got it — 118 over 76, nice numbers") but do NOT ask them to confirm again and do not claim it is saved yet.`,
    )
  }
  lines.push(`\nFull health context (JSON, current as of now):\n${contextForPrompt(ctx, 'full')}`)
  return lines.join('\n')
}

export async function GET() {
  const rows = await db.chatMessage.findMany({ orderBy: { createdAt: 'asc' }, take: 200 })
  return ok({ messages: rows })
}

export async function POST(req: Request) {
  if (!rateLimit(clientKey(req, 'chat'), 20, 60_000)) {
    return fail('Eir needs a breath — try again in a moment.', 429)
  }
  const parsed = await parseBody(req, postSchema)
  if ('response' in parsed) return parsed.response
  const { text, channel } = parsed.data

  const detected = await detectAction(text)

  const userMsg = await db.chatMessage.create({
    data: { role: 'user', content: text, channel, meta: detected ? JSON.stringify({ detected }) : '{}' },
  })

  const history = await db.chatMessage.findMany({
    orderBy: { createdAt: 'desc' }, take: HISTORY_LIMIT,
  })
  history.reverse()

  const ctx = await buildHealthContext()
  if (!ctx) return fail('Complete setup first', 400)

  const memories = await retrieveMemories(text)

  const messages = [
    { role: 'system' as const, content: systemPrompt(ctx, detected, memoriesForPrompt(memories), channel) },
    ...history.map((m) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: m.content,
    })),
  ]

  const result = await completeChat('chat', messages)
  if (!result.ok) {
    // remove the orphan user turn so the thread stays honest after a retry
    await db.chatMessage.delete({ where: { id: userMsg.id } }).catch(() => {})
    let detail = result.attempted.length ? ` (${result.attempted[0].slice(0, 220)})` : ''
    if (!result.attempted.length) {
      detail = ' — no AI provider is enabled. Open Settings → AI providers and connect one.'
    }
    return fail(`Eir couldn't reach any AI provider yet${detail}`, 502, { attempted: result.attempted })
  }

  const reply = result.text.trim()
  const assistantMsg = await db.chatMessage.create({
    data: {
      role: 'assistant',
      content: reply,
      channel,
      meta: JSON.stringify({ provider: result.providerLabel, model: result.model, detected: detected ?? undefined, memoriesUsed: memories.length }),
    },
  })

  // Memory writing is strictly post-reply and best-effort: deterministic
  // patterns first, AI extractor only for substantial turns.
  void (async () => {
    try {
      await storeMemories(extractDeterministic(text), userMsg.id)
      if (text.length >= 40) await aiExtract(text, reply, userMsg.id)
    } catch { /* never break the chat response over memory */ }
  })()

  return ok({
    userMessageId: userMsg.id,
    reply,
    replyId: assistantMsg.id,
    provider: { label: result.providerLabel, model: result.model, latencyMs: result.latencyMs },
    detected,
  })
}

export async function DELETE() {
  await db.chatMessage.deleteMany({})
  return ok({ cleared: true })
}
