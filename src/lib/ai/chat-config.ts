// OpenEir — chat behavior configuration (Settings → Providers → Chat).
// Stored as a single JSON AppSetting row; every knob defaults to the exact
// behavior v3.4 shipped (persona = companion, verbosity = balanced,
// temperature = 0.6), so enabling this layer changes nothing until the user
// touches it. The server is the single source of truth — all devices agree.

import { db } from '@/lib/db'

export type PersonaPreset = 'companion' | 'clinician' | 'coach' | 'custom'
export type Verbosity = 'short' | 'balanced' | 'detailed'

export interface ChatConfig {
  personaPreset: PersonaPreset
  /** free-text persona when personaPreset === 'custom' (appended after the safety identity lines) */
  personaCustom: string
  verbosity: Verbosity
  /** 0..1 — replaces the previously hardcoded 0.6 */
  temperature: number
}

export const DEFAULT_CHAT_CONFIG: ChatConfig = {
  personaPreset: 'companion',
  personaCustom: '',
  verbosity: 'balanced',
  temperature: 0.6,
}

export const PERSONA_PRESETS: Record<Exclude<PersonaPreset, 'custom'>, string> = {
  companion:
    'Tone: warm, steady friend. Celebrate small wins, keep it human, never lecture.',
  clinician:
    'Tone: precise clinical assistant. Lead with the numbers and units, flag anything outside the user\'s target ranges, skip small talk, stay factual and calm.',
  coach:
    'Tone: encouraging health coach. Focus on momentum: one concrete next step per reply, celebrate streaks, frame setbacks as data — never as failure.',
}

const KEY = 'chat.config'

function clampTemp(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0.6
  return Math.min(1, Math.max(0, Math.round(n * 100) / 100))
}

export async function getChatConfig(): Promise<ChatConfig> {
  const row = await db.appSetting.findUnique({ where: { key: KEY } })
  if (!row) return { ...DEFAULT_CHAT_CONFIG }
  try {
    const raw = JSON.parse(row.value) as Partial<ChatConfig>
    const verbosity: Verbosity = raw.verbosity === 'short' || raw.verbosity === 'detailed' ? raw.verbosity : 'balanced'
    const personaPreset: PersonaPreset =
      raw.personaPreset === 'clinician' || raw.personaPreset === 'coach' || raw.personaPreset === 'custom'
        ? raw.personaPreset
        : 'companion'
    return {
      personaPreset,
      personaCustom: typeof raw.personaCustom === 'string' ? raw.personaCustom.slice(0, 2000) : '',
      verbosity,
      temperature: clampTemp(raw.temperature),
    }
  } catch {
    return { ...DEFAULT_CHAT_CONFIG }
  }
}

export async function saveChatConfig(patch: Partial<ChatConfig>): Promise<ChatConfig> {
  const current = await getChatConfig()
  const next: ChatConfig = {
    personaPreset: patch.personaPreset ?? current.personaPreset,
    personaCustom: (patch.personaCustom ?? current.personaCustom).slice(0, 2000),
    verbosity: patch.verbosity ?? current.verbosity,
    temperature: clampTemp(patch.temperature ?? current.temperature),
  }
  await db.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  })
  return next
}

/** Persona system lines (appended after Eir's fixed identity + safety lines — never replacing them). */
export function personaLines(cfg: ChatConfig): string[] {
  if (cfg.personaPreset === 'custom') {
    const text = cfg.personaCustom.trim()
    if (!text) return []
    return [`The user has customized how you should talk (follow it inside the safety rules above):\n${text}`]
  }
  return [PERSONA_PRESETS[cfg.personaPreset]]
}

/** Verbosity guidance — replaces the old hardcoded "under 110 words" line. */
export function verbosityLine(cfg: ChatConfig): string {
  switch (cfg.verbosity) {
    case 'short':
      return 'Keep replies short: one or two sentences, under 60 words, unless the user explicitly asks for more.'
    case 'detailed':
      return 'Give thorough, well-structured answers: explain what the numbers mean, add relevant context and practical next steps. Around 150–300 words unless the user asks to keep it brief.'
    default:
      return 'Keep replies under 110 words unless the user explicitly asks for depth.'
  }
}
