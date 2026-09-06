// OpenEir — vision OCR through the existing AI provider chain.
// A vision-capable model reads the device photo and returns strict JSON;
// the deterministic regex parser cross-checks the model's own transcript.
// Agreement raises confidence; conflict caps it and forces confirmation.

import { completeChat, type ChatImage } from '@/lib/ai/providers'
import { parseDeviceText } from './regex-parser'
import {
  SCAN_FIELDS, SCAN_CONFIDENCE_THRESHOLD,
  type ScanFields, type ScanResult,
} from './types'

const SYSTEM_PROMPT = [
  'You extract numbers from photos of medical devices (blood pressure monitors, glucometers) and lab report excerpts.',
  'Answer with ONLY a JSON object — no prose, no markdown fences.',
  'Blood pressure monitor -> {"kind":"bp","systolic":<int>,"diastolic":<int>,"pulse":<int|null>,"transcript":"all digits you see"}',
  'Glucometer -> {"kind":"glucose","value":<number>,"unit":"mg/dL"|"mmol/L","transcript":"all digits you see"}',
  'Anything else / unreadable -> {"kind":"unknown","transcript":"..."}.',
  'Never invent values. If a digit is ambiguous, set kind to "unknown".',
].join('\n')

/** Pull the first JSON object out of a model response (tolerates fences/prose). */
function extractJson(text: string): Record<string, unknown> | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

function coerceFields(json: Record<string, unknown>): { fields: ScanFields; transcript: string } | null {
  const parsed = SCAN_FIELDS.safeParse(json)
  if (parsed.success) {
    return { fields: parsed.data, transcript: String(json.transcript ?? '') }
  }
  // model may have omitted defaults (e.g. unit) — retry with repairs
  if (json.kind === 'glucose' && typeof json.value === 'number') {
    const repaired = SCAN_FIELDS.safeParse({ ...json, unit: json.unit ?? 'mg/dL' })
    if (repaired.success) {
      return { fields: repaired.data, transcript: String(json.transcript ?? '') }
    }
  }
  return null
}

function agreementBoost(
  modelFields: ScanFields,
  transcriptFields: ScanFields,
): { fields: ScanFields; agree: boolean } {
  if (modelFields.kind === 'unknown') return { fields: transcriptFields, agree: false }
  if (transcriptFields.kind !== modelFields.kind) return { fields: modelFields, agree: false }
  if (modelFields.kind === 'bp' && transcriptFields.kind === 'bp') {
    const agree =
      transcriptFields.systolic === modelFields.systolic &&
      transcriptFields.diastolic === modelFields.diastolic
    if (!agree) {
      // trust the model's structured read but flag it
      return { fields: modelFields, agree: false }
    }
    // prefer the model (keeps pulse), transcript only corroborates
    return { fields: modelFields, agree: true }
  }
  if (modelFields.kind === 'glucose' && transcriptFields.kind === 'glucose') {
    const agree = Math.abs(transcriptFields.value - modelFields.value) < 0.01 &&
      transcriptFields.unit === modelFields.unit
    return { fields: modelFields, agree }
  }
  return { fields: modelFields, agree: false }
}

export async function visionScan(image: Buffer, mediaType: string): Promise<ScanResult> {
  const notes: string[] = []
  const img: ChatImage = { mediaType, dataBase64: image.toString('base64') }
  const result = await completeChat('ocr', [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: 'Extract the reading from this photo. Reply with the JSON object only.',
      images: [img],
    },
  ])

  if (!result.ok) {
    notes.push(`AI vision unavailable (${result.attempted.length ? result.attempted.join('; ').slice(0, 200) : 'no provider'}) — trying local OCR.`)
    return { kind: 'unknown', confidence: 0, fields: { kind: 'unknown' }, rawText: '', via: [], needsConfirm: true, notes }
  }

  notes.push(`Read by ${result.providerLabel}${result.model ? ` (${result.model})` : ''} in ${result.latencyMs} ms.`)
  const json = extractJson(result.text)
  const coerced = json ? coerceFields(json) : null
  if (!coerced) {
    notes.push('Model reply was not valid scan JSON — falling back to transcript parsing.')
    const transcript = String(json?.transcript ?? '')
    const fields = transcript ? parseDeviceText(transcript) : { kind: 'unknown' as const }
    return {
      kind: fields.kind, confidence: fields.kind === 'unknown' ? 0.3 : 0.6,
      fields, rawText: transcript, via: ['vision'], needsConfirm: true, notes,
    }
  }

  const transcriptFields = coerced.transcript ? parseDeviceText(coerced.transcript) : { kind: 'unknown' as const }
  const { fields, agree } = agreementBoost(coerced.fields, transcriptFields)

  let confidence: number
  if (fields.kind === 'unknown') confidence = 0.2
  else if (agree) confidence = 0.97
  else if (transcriptFields.kind === 'unknown') confidence = 0.8
  else confidence = 0.7

  if (fields.kind !== 'unknown' && !agree) {
    notes.push(
      transcriptFields.kind === 'unknown'
        ? 'Transcript could not corroborate the value — please verify carefully.'
        : 'Cross-check with the model transcript disagreed — please verify carefully.',
    )
  }

  return {
    kind: fields.kind,
    confidence,
    fields,
    rawText: coerced.transcript,
    via: ['vision'],
    needsConfirm: fields.kind === 'unknown' || confidence < SCAN_CONFIDENCE_THRESHOLD,
    notes,
  }
}
