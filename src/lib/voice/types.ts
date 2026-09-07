// OpenEir — voice pipeline types. A voice capture is ALWAYS a suggestion:
// the UI gates every save behind a spoken readback + explicit confirmation
// (never auto-log). Same safety philosophy as the OCR pipeline.
import { z } from 'zod'

export const BP_VOICE_FIELDS = z.object({
  kind: z.literal('bp'),
  systolic: z.number().int().min(50).max(300),
  diastolic: z.number().int().min(20).max(200),
  pulse: z.number().int().min(20).max(300).nullable().optional(),
  label: z.enum(['morning', 'evening', 'pre_med', 'post_med', 'general']).default('general'),
  takenAt: z.string().optional(), // ISO string when a time expression was heard
})

export const GLUCOSE_VOICE_FIELDS = z.object({
  kind: z.literal('glucose'),
  /** canonical mmol/L (mg/dL input is converted) */
  value: z.number().min(1).max(40),
  /** unit as heard, for the readback */
  heardUnit: z.enum(['mg/dL', 'mmol/L']),
  context: z.enum(['fasting', 'pre_meal', 'post_meal', 'bedtime', 'random']).default('random'),
  takenAt: z.string().optional(),
})

export const MED_VOICE_FIELDS = z.object({
  kind: z.literal('med_taken').or(z.literal('med_skipped')),
  /** medication name as heard — fuzzy-matched against the user's med list in the hook */
  nameHeard: z.string().min(1).max(120),
  /** dose as heard, e.g. { value: 10, unit: 'mg' } — display-only for the readback */
  doseHeard: z.object({ value: z.number(), unit: z.string() }).nullable().optional(),
  /** HH:MM 24h, resolved from a time expression; null = now */
  time: z.string().nullable().optional(),
})

export const NOTE_VOICE_FIELDS = z.object({
  kind: z.literal('note'),
  text: z.string().min(1).max(500),
})

export const UNKNOWN_VOICE_FIELDS = z.object({ kind: z.literal('unknown') })

export const VOICE_INTENT_FIELDS = z.discriminatedUnion('kind', [
  BP_VOICE_FIELDS,
  GLUCOSE_VOICE_FIELDS,
  MED_VOICE_FIELDS,
  NOTE_VOICE_FIELDS,
  UNKNOWN_VOICE_FIELDS,
])

export type BpVoiceFields = z.infer<typeof BP_VOICE_FIELDS>
export type GlucoseVoiceFields = z.infer<typeof GLUCOSE_VOICE_FIELDS>
export type MedVoiceFields = z.infer<typeof MED_VOICE_FIELDS>
export type NoteVoiceFields = z.infer<typeof NOTE_VOICE_FIELDS>
export type VoiceIntentFields = z.infer<typeof VOICE_INTENT_FIELDS>

export interface VoiceIntent {
  kind: 'bp' | 'glucose' | 'med_taken' | 'med_skipped' | 'note' | 'unknown'
  /** 0..1 — keyword hits and field completeness raise it; ambiguity caps it */
  confidence: number
  fields: VoiceIntentFields
  /** clean transcript the intent was parsed from */
  rawText: string
  /** true when below the auto-suggest threshold — fields need careful review */
  needsConfirm: boolean
  /** friendly notes about what was heard / assumed */
  notes: string[]
}

/**
 * Everything at or above this level still goes through readback confirmation,
 * but the card renders confident (primary) instead of a caution styling.
 * Mirrors SCAN_CONFIDENCE_THRESHOLD so voice and OCR feel consistent.
 */
export const VOICE_CONFIDENCE_THRESHOLD = 0.75

/** Human-readable readback — what Eir speaks and shows before saving. */
export function readbackFor(intent: VoiceIntent): string {
  switch (intent.fields.kind) {
    case 'bp': {
      const f = intent.fields
      let s = `Blood pressure ${f.systolic} over ${f.diastolic}`
      if (f.pulse) s += `, pulse ${f.pulse}`
      if (f.label === 'morning') s += ', morning'
      if (f.label === 'evening') s += ', evening'
      if (f.takenAt) s += `, at ${new Date(f.takenAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
      return s + '.'
    }
    case 'glucose': {
      const f = intent.fields
      let s = `Blood sugar ${f.value} millimoles per litre`
      if (f.heardUnit === 'mg/dL') s = `Blood sugar ${Math.round(f.value * 18)} milligrams per decilitre`
      if (f.context === 'fasting') s += ', fasting'
      if (f.context === 'post_meal') s += ', after a meal'
      if (f.context === 'bedtime') s += ', bedtime'
      return s + '.'
    }
    case 'med_taken':
    case 'med_skipped': {
      const f = intent.fields
      const action = f.kind === 'med_taken' ? 'took' : 'skipped'
      let s = `You ${action} ${f.nameHeard}`
      if (f.doseHeard) s += `, ${f.doseHeard.value} ${f.doseHeard.unit}`
      if (f.time) s += ` at ${f.time}`
      return s + '.'
    }
    case 'note':
      return `Note: ${intent.fields.text}`
    case 'unknown':
      return "I couldn't map that to a loggable entry yet."
  }
}
