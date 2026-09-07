// OpenEir — deterministic English voice-command parser.
// Pure functions, zero network, zero AI: the transcript goes in, a typed
// intent comes out. Runs identically on spoken (STT) and typed (fallback)
// input, which makes it fully testable and private by construction.
//
// Design contract (mirrors the OCR ladder): parse -> readback -> human
// confirm -> save with source:'voice'. The parser never decides to save.

import type { VoiceIntent } from './types'

// ---------- number words -> digits ----------

const UNITS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 }
const TEENS: Record<string, number> = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 }
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }

/**
 * Rewrite spoken number phrases into digits so downstream regexes are simple.
 * Handles: "one hundred twenty" -> 120, "one twenty" -> 120 (colloquial BP
 * speech), "twenty two"/"twenty-two" -> 22, "eighty" -> 80, "a hundred" -> 100.
 */
export function normalizeNumberWords(input: string): string {
  const tokens = input.toLowerCase().replace(/-/g, ' ').split(/\s+/).filter(Boolean)
  const out: string[] = []
  let phrase = 0 // accumulated value of the current number phrase
  let seenHundred = false
  let inPhrase = false

  const flush = () => {
    if (inPhrase) { out.push(String(phrase)); phrase = 0; seenHundred = false; inPhrase = false }
  }

  for (const tok of tokens) {
    if (tok === 'and' && inPhrase) continue // "one hundred and five"
    if (tok === 'a' || tok === 'an') { // "a hundred" — treat as 1 only before hundred
      out.push(tok) // provisional; merged below if next is "hundred"
      continue
    }
    const isUnit = tok in UNITS
    const isTeen = tok in TEENS
    const isTens = tok in TENS
    const isHundred = tok === 'hundred'
    if (!isUnit && !isTeen && !isTens && !isHundred) { flush(); out.push(tok); continue }

    // "a hundred" -> "100"
    const last = out[out.length - 1]
    if (isHundred && (last === 'a' || last === 'an')) out.pop()

    const val = isUnit ? UNITS[tok] : isTeen ? TEENS[tok] : isTens ? TENS[tok] : 0
    if (isHundred) {
      phrase = (phrase || 1) * 100
      seenHundred = true
      inPhrase = true
    } else if (!inPhrase) {
      phrase = val
      inPhrase = true
    } else if (seenHundred) {
      phrase += val // "one hundred twenty" -> 120
    } else if (phrase < 10 && val >= 10) {
      phrase = Number(`${phrase}${val}`) // "one twenty" -> 120 (colloquial)
    } else if (phrase >= 10 && phrase % 10 === 0 && val < 10) {
      phrase += val // "twenty two" -> 22
    } else {
      flush(); phrase = val; inPhrase = true // separate numbers
    }
  }
  flush()
  return out.join(' ')
}

// ---------- time expressions ----------

export interface TimeExtraction {
  /** HH:MM 24h — null when the expression was relative to now */
  hhmm: string | null
  /** Date when resolvable (now-offset or today + hh:mm); null when absent */
  at: Date | null
  note: string | null
}

const pad = (n: number) => String(n).padStart(2, '0')

function todayAt(h: number, m: number): Date {
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d
}

/** Extract the first time expression from the sentence (and consume it from `rest`). */
export function extractTime(text: string): { time: TimeExtraction; rest: string } {
  let m: RegExpMatchArray | null
  const now = new Date()

  // absolute clock — requires an explicit anchor: "at 8", "8:30", "8 pm".
  // (A bare number would hijack doses like "took 10 milligrams".)
  const RE_AT = /\bat\s+(?<h>\d{1,2})(?::(?<min>\d{2}))?\s*(?<tail>a\.?m\.?|p\.?m\.?|in the morning|in the afternoon|in the evening|at night)?/
  const RE_COLON = /(?<h>\d{1,2}):(?<min>\d{2})\s*(?<tail>a\.?m\.?|p\.?m\.?)?/
  const RE_AMPM = /(?<h>\d{1,2})\s*(?<tail>a\.?m\.?|p\.?m\.?)/
  m = text.match(RE_AT) ?? text.match(RE_COLON) ?? text.match(RE_AMPM)
  if (m && m.groups?.h) {
    let h = Number(m.groups.h)
    const min = m.groups.min ? Number(m.groups.min) : 0
    const tail = m.groups.tail ?? ''
    if (/p\.?m/i.test(tail) && h < 12) h += 12
    if (/a\.?m/i.test(tail) && h === 12) h = 0
    if (!tail && !m.groups.min && h <= 12 && /night|evening/i.test(text)) { if (h < 12) h += 12 }
    if (h >= 0 && h <= 23 && min <= 59) {
      const at = todayAt(h, min)
      return {
        time: { hhmm: `${pad(h)}:${pad(min)}`, at, note: null },
        rest: (text.slice(0, m.index ?? 0) + ' ' + text.slice((m.index ?? 0) + m[0].length)).replace(/\s+/g, ' ').trim(),
      }
    }
  }

  // named times of day
  const named: [RegExp, number, number][] = [
    [/\b(?:this\s+)?morning\b/, 8, 0],
    [/\bnoon\b/, 12, 0],
    [/\b(?:this\s+)?afternoon\b/, 14, 0],
    [/\b(?:this\s+evening|tonight)\b/, 20, 0],
    [/\blast\s+night\b/, 21, 0],
    [/\bbreakfast\b/, 8, 0],
  ]
  for (const [re, h, min] of named) {
    m = text.match(re)
    if (m) {
      const at = todayAt(h, min)
      return {
        time: { hhmm: `${pad(h)}:${pad(min)}`, at, note: null },
        rest: (text.slice(0, m.index ?? 0) + ' ' + text.slice((m.index ?? 0) + m[0].length)).replace(/\s+/g, ' ').trim(),
      }
    }
  }

  // relative offsets: "half an hour ago", "N minutes/hours ago", "just now"
  m = text.match(/\bhalf an hour ago\b/)
  if (m) { const at = new Date(now.getTime() - 30 * 60000); return { time: { hhmm: `${pad(at.getHours())}:${pad(at.getMinutes())}`, at, note: null }, rest: (text.slice(0, m.index ?? 0) + ' ' + text.slice((m.index ?? 0) + m[0].length)).trim() } }
  m = text.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(minutes?|mins?|hours?)\s+ago\b/)
  if (m) {
    const nWord = m[1]
    const n = /^\d+$/.test(nWord) ? Number(nWord) : (UNITS[nWord] ?? 1)
    const ms = /min/i.test(m[2]) ? n * 60000 : n * 3600000
    const at = new Date(now.getTime() - ms)
    return { time: { hhmm: `${pad(at.getHours())}:${pad(at.getMinutes())}`, at, note: null }, rest: (text.slice(0, m.index ?? 0) + ' ' + text.slice((m.index ?? 0) + m[0].length)).trim() }
  }
  m = text.match(/\bjust now\b/)
  if (m) return { time: { hhmm: null, at: null, note: null }, rest: (text.slice(0, m.index ?? 0) + ' ' + text.slice((m.index ?? 0) + m[0].length)).trim() }

  return { time: { hhmm: null, at: null, note: null }, rest: text }
}

// ---------- helpers ----------

const FILLERS = /\b(?:um+|uh+|erm+|like|hey|okay|ok|please)\b[,\s]*/gi
const clean = (s: string) => s.replace(FILLERS, ' ').replace(/\s+/g, ' ').trim().replace(/[.!?,;]+$/g, '')

const stripDose = (s: string): { name: string; dose: { value: number; unit: string } | null } => {
  const m = s.match(/(\d+(?:\.\d+)?)\s*(milligrams?|mgs?|mg|micrograms?|mcg|µg|ug|millilitres?|milliliters?|ml|units?|iu|tablets?|pills?|capsules?|drops?)\b/i)
  if (!m) return { name: s, dose: null }
  const raw = m[2].toLowerCase()
  const unit = raw.startsWith('milligram') || raw === 'mgs' || raw === 'mg' ? 'mg'
    : raw.startsWith('microgram') || raw === 'mcg' || raw === 'µg' || raw === 'ug' ? 'µg'
    : raw.startsWith('millilitre') || raw.startsWith('milliliter') || raw === 'ml' ? 'ml'
    : raw.startsWith('tablet') || raw === 'pills' || raw === 'pill' ? 'tablets'
    : raw.startsWith('capsule') ? 'tablets'
    : raw.startsWith('drop') ? 'drops'
    : raw === 'iu' ? 'IU' : 'units'
  const name = (s.slice(0, m.index ?? 0) + ' ' + s.slice((m.index ?? 0) + m[0].length)).replace(/\s+/g, ' ').trim()
  return { name, dose: { value: Number(m[1]), unit } }
}

const tidyName = (s: string) =>
  clean(s)
    .replace(/^(?:i\s+)?(?:just\s+)?(?:took|taken|had|skipped|missed)\s+/i, '')
    .replace(/^(?:my|the|a|an)\s+/i, '')
    .replace(/^of\s+/i, '')
    .replace(/\s+(?:tablet|tablets|pill|pills|capsule|capsules)s?$/i, '')
    .replace(/\s+(?:already|earlier|today)$/i, '')
    .trim()

// ---------- main entry ----------

/**
 * Parse a transcript (spoken or typed) into a structured, loggable intent.
 * Intent precedence: BP -> glucose -> medication -> note. BP needs the
 * "X over Y" shape, so "I took my blood pressure pill" can never hijack it.
 */
export function parseVoiceCommand(raw: string): VoiceIntent {
  const text = clean(normalizeNumberWords(raw.toLowerCase()))
  if (!text) return { kind: 'unknown', confidence: 0, fields: { kind: 'unknown' }, rawText: raw, needsConfirm: true, notes: ['Nothing to parse.'] }

  // ---- blood pressure: "<sys> over <dia>" (keyword boosts confidence) ----
  const bpMatch = text.match(/(\d{2,3})\s*(?:over|\/)\s*(\d{2,3})/)
  if (bpMatch) {
    const sys = Number(bpMatch[1])
    const dia = Number(bpMatch[2])
    const hasKeyword = /\b(?:blood\s*pressure|pressure|bp)\b/.test(text)
    const { time } = extractTime(text)
    let label: 'morning' | 'evening' | 'pre_med' | 'post_med' | 'general' = 'general'
    if (/\b(?:before|pre)[\s-]*(?:my\s+)?med/.test(text)) label = 'pre_med'
    else if (/\b(?:after|post)[\s-]*(?:my\s+)?med/.test(text)) label = 'post_med'
    else if (/\b(?:this\s+)?morning\b/.test(text)) label = 'morning'
    else if (/\b(?:evening|tonight)\b/.test(text)) label = 'evening'

    let pulse: number | null = null
    const pm = text.match(/(?:pulse|heart\s*rate)\D{0,8}(\d{2,3})/)
    if (pm) pulse = Number(pm[1])

    const inRange = sys >= 50 && sys <= 300 && dia >= 20 && dia <= 200
    const notes: string[] = []
    if (!hasKeyword) notes.push('No “blood pressure” keyword — matched the “X over Y” pattern.')
    if (!inRange) notes.push('Values look out of range — please review.')

    return {
      kind: 'bp',
      confidence: inRange ? (hasKeyword ? 0.95 : 0.8) : 0.35,
      fields: { kind: 'bp', systolic: sys, diastolic: dia, pulse: pulse ?? undefined, label, takenAt: time.at?.toISOString() },
      rawText: text,
      needsConfirm: !inRange || !hasKeyword,
      notes,
    }
  }

  // ---- glucose: keyword + single number, unit heuristics ----
  const glKeyword = text.match(/\b(?:glucose|blood\s+sugar|sugar|mmol|millimoles?)\b/)
  if (glKeyword) {
    const nm = text.match(/(\d+(?:\.\d+)?)/)
    if (nm) {
      const heard = Number(nm[1])
      const explicitMg = /\b(?:mg|milligrams?)/.test(text)
      const explicitMmol = /\b(?:mmol|millimoles?)/.test(text)
      let unit: 'mg/dL' | 'mmol/L' = explicitMmol ? 'mmol/L' : explicitMg ? 'mg/dL' : heard > 40 ? 'mg/dL' : 'mmol/L'
      const notes: string[] = []
      if (!explicitMg && !explicitMmol) notes.push(`Assumed ${unit} — say “milligrams” or “millimoles” next time to be explicit.`)
      let value = unit === 'mg/dL' ? Math.round((heard / 18) * 10) / 10 : heard
      if (value < 1 || value > 40) {
        notes.push('Value out of range (1–40 mmol/L) — please review or use the Record form.')
      }
      let context: 'fasting' | 'pre_meal' | 'post_meal' | 'bedtime' | 'random' = 'random'
      if (/\bfasting\b|\bbefore\s+breakfast\b/.test(text)) context = 'fasting'
      else if (/\b(?:before|pre)[\s-]?(?:my\s+)?(?:breakfast|lunch|dinner|meal|eating)\b/.test(text)) context = 'pre_meal'
      else if (/\b(?:after|post)[\s-]?(?:my\s+)?(?:breakfast|lunch|dinner|meal|eating)\b/.test(text)) context = 'post_meal'
      else if (/\b(?:bedtime|before\s+bed)\b/.test(text)) context = 'bedtime'
      // strip period/meal words too so "after breakfast" can't be read as a clock time
      const { time } = extractTime(text.replace(/\b(?:fasting|before|after|bedtime|morning|afternoon|evening|tonight|noon|night|breakfast|lunch|dinner)\b/g, ''))

      return {
        kind: 'glucose',
        confidence: value >= 1 && value <= 40 ? (explicitMg || explicitMmol ? 0.95 : 0.85) : 0.3,
        fields: { kind: 'glucose', value, heardUnit: unit, context, takenAt: time.at?.toISOString() },
        rawText: text,
        needsConfirm: !(value >= 1 && value <= 40),
        notes,
      }
    }
  }

  // ---- medication: took / had / skipped / missed ----
  const medMatch = text.match(/\b(?:i\s+)?(?:just\s+)?(took|taken|had|skipped|missed)\b\s*(.*)$/)
  if (medMatch) {
    const verb = medMatch[1]
    const kind = verb === 'skipped' || verb === 'missed' ? 'med_skipped' : 'med_taken'
    const { time, rest } = extractTime(medMatch[2])
    const { name: nameWithDose, dose } = stripDose(rest)
    const name = tidyName(nameWithDose)

    if (name && name.length >= 2) {
      const notes: string[] = []
      let confidence = 0.85
      if (dose) confidence += 0.05
      if (time.hhmm) confidence += 0.05
      if (!time.hhmm && !time.at) notes.push('No time heard — logging for right now.')
      return {
        kind,
        confidence: Math.min(0.95, confidence),
        fields: { kind, nameHeard: name, doseHeard: dose ?? undefined, time: time.hhmm ?? undefined },
        rawText: text,
        needsConfirm: true, // meds ALWAYS confirm — safety invariant
        notes,
      }
    }
  }

  // ---- free text note (fallback that still has value) ----
  const words = text.split(' ').length
  if (words >= 2) {
    return {
      kind: 'note',
      confidence: 0.5,
      fields: { kind: 'note', text: clean(raw) },
      rawText: text,
      needsConfirm: true,
      notes: ['Not a reading or medication — saved as a note draft you can copy into Record.'],
    }
  }

  return {
    kind: 'unknown',
    confidence: 0,
    fields: { kind: 'unknown' },
    rawText: text,
    needsConfirm: true,
    notes: ['Try: “blood pressure 120 over 80”, “glucose 6.2 fasting”, or “I took my lisinopril”.'],
  }
}
