// OpenEir — deterministic offline parser for medical device text.
// Works on transcript text from ANY extractor (vision model, tesseract).
// No network, no AI — the always-available floor of the OCR ladder.

import type { ScanFields } from './types'

const BP_FRACTION = /(\d{2,3})\s*[/\\⁄]\s*(\d{2,3})/
const BP_SPOKEN = /(\d{2,3})\s*(?:over|\/)\s*(\d{2,3})/i
const PULSE = /(?:pulse|pul|bpm)?[:\s]*\b(\d{2,3})\s*(?:bpm|bpm\.|pul)\b/i
const PULSE_BARE = /\b(\d{2,3})\s*bpm\b/i
const GLUCOSE_MGDL = /(\d{2,3})\s*(?:mg\s*\/?\s*dl|mgdl)/i
const GLUCOSE_MMOL = /(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:mmol\s*\/?\s*l|mmoll)/i
/** Numeric-noise filter: skip numbers that are clearly years, times, serials. */
const NOISE = /^(19|20)\d{2}$|^\d{1,2}:\d{2}$/

function plausibleBp(sys: number, dia: number): boolean {
  return sys >= 60 && sys <= 260 && dia >= 30 && dia <= 180 && sys > dia
}

function plausiblePulse(p: number): boolean {
  return p >= 30 && p <= 220
}

/** Extract a BP reading from raw text. Returns null when nothing plausible. */
export function parseBpText(text: string): { systolic: number; diastolic: number; pulse?: number } | null {
  const clean = text.replace(/\u00a0/g, ' ')
  let sys: number | null = null
  let dia: number | null = null

  const frac = BP_FRACTION.exec(clean) ?? BP_SPOKEN.exec(clean)
  if (frac) {
    const s = Number(frac[1]); const d = Number(frac[2])
    if (!NOISE.test(frac[1]) && !NOISE.test(frac[2]) && plausibleBp(s, d)) {
      sys = s; dia = d
    }
  }

  // try "145 95" adjacency as a last resort (7-segment OCR often drops the slash)
  if (sys === null) {
    const pairs = [...clean.matchAll(/\b(\d{2,3})\s+(\d{2,3})\b/g)]
    for (const p of pairs) {
      const s = Number(p[1]); const d = Number(p[2])
      if (NOISE.test(p[1]) || NOISE.test(p[2])) continue
      if (plausibleBp(s, d)) { sys = s; dia = d; break }
    }
  }

  if (sys === null || dia === null) return null

  let pulse: number | undefined
  const pm = PULSE.exec(clean) ?? PULSE_BARE.exec(clean)
  if (pm) {
    const p = Number(pm[1])
    if (plausiblePulse(p) && p !== sys && p !== dia) pulse = p
  }

  return { systolic: sys, diastolic: dia, ...(pulse !== undefined ? { pulse } : {}) }
}

/** Extract a glucose value from raw text. Returns null when nothing plausible. */
export function parseGlucoseText(text: string): { value: number; unit: 'mg/dL' | 'mmol/L' } | null {
  const clean = text.replace(/\u00a0/g, ' ')
  const mg = GLUCOSE_MGDL.exec(clean)
  if (mg && !NOISE.test(mg[1])) {
    const v = Number(mg[1])
    if (v >= 20 && v <= 600) return { value: v, unit: 'mg/dL' }
  }
  const mmol = GLUCOSE_MMOL.exec(clean)
  if (mmol && !NOISE.test(mmol[1])) {
    const v = Number(mmol[1].replace(',', '.'))
    if (v >= 1 && v <= 35) return { value: v, unit: 'mmol/L' }
  }
  return null
}

/** Parse any device text into typed scan fields (or 'unknown'). */
export function parseDeviceText(text: string): ScanFields {
  const bp = parseBpText(text)
  if (bp) return { kind: 'bp', systolic: bp.systolic, diastolic: bp.diastolic, pulse: bp.pulse ?? null }
  const gl = parseGlucoseText(text)
  if (gl) return { kind: 'glucose', value: gl.value, unit: gl.unit }
  return { kind: 'unknown' }
}
