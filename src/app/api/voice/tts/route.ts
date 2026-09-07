// OpenEir — server-side neural TTS (Microsoft Edge voices via msedge-tts).
//
// Why: browser SpeechSynthesis quality is stuck with whatever robotic voice
// the OS ships. Edge's neural voices (the "Read Aloud" set) sound human, and
// this module runs them **inside the user's own server** — no Azure account,
// no API key, no per-request cost. The endpoint:
//
//   GET  /api/voice/tts  → curated voice catalog for the picker UI
//   POST /api/voice/tts  → { text, voice?, rate? } → audio/mpeg
//
// Synthesized audio is cached on disk keyed by voice+rate+text hash, so a
// repeated readback (the common case — confirmations are formulaic) is a
// filesystem hit, not a round-trip to Microsoft. Text is validated and
// length-capped; audio is never persisted with any health data context.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import { DEFAULT_EDGE_VOICE } from '@/lib/voice/edge-voice'

export const dynamic = 'force-dynamic'

const CACHE_DIR = path.join(process.cwd(), '.tts-cache')
const MAX_TEXT = 600 // readbacks are one or two sentences; cap hard

const SpeakSchema = z.object({
  text: z.string().trim().min(1).max(MAX_TEXT),
  voice: z
    .string()
    .regex(/^[a-z]{2,3}-[A-Za-z]+-[A-Za-z]+Neural$/, 'not a neural voice short-name')
    .max(64)
    .optional(),
  rate: z.number().min(0.6).max(1.6).optional(),
})

/** 0.9 → "-10%", 1.2 → "+20%" (SSML relative percentage). */
function rateToPct(rate: number): string {
  const pct = Math.round((rate - 1) * 100)
  return `${pct >= 0 ? '+' : ''}${pct}%`
}

interface CatalogVoice {
  id: string
  label: string
  gender: 'Female' | 'Male'
  accent: string
  note?: string
}

/** Curated EN-first catalog — hand-picked for warmth/clarity in a medical context. */
const VOICES: CatalogVoice[] = [
  { id: 'en-US-AndrewMultilingualNeural', label: 'Andrew', gender: 'Male', accent: 'English (US)', note: 'Warm, natural — default' },
  { id: 'en-US-EmmaMultilingualNeural', label: 'Emma', gender: 'Female', accent: 'English (US)', note: 'Calm, reassuring' },
  { id: 'en-US-BrianMultilingualNeural', label: 'Brian', gender: 'Male', accent: 'English (US)', note: 'Deep, steady' },
  { id: 'en-US-AriaNeural', label: 'Aria', gender: 'Female', accent: 'English (US)', note: 'Crisp, precise' },
  { id: 'en-US-JennyNeural', label: 'Jenny', gender: 'Female', accent: 'English (US)', note: 'Friendly' },
  { id: 'en-US-GuyNeural', label: 'Guy', gender: 'Male', accent: 'English (US)', note: 'Newsroom clarity' },
  { id: 'en-GB-SoniaNeural', label: 'Sonia', gender: 'Female', accent: 'English (UK)', note: 'Clear British' },
  { id: 'en-GB-RyanNeural', label: 'Ryan', gender: 'Male', accent: 'English (UK)' },
  { id: 'en-GB-ThomasNeural', label: 'Thomas', gender: 'Male', accent: 'English (UK)', note: 'Measured' },
  { id: 'en-AU-NatashaNeural', label: 'Natasha', gender: 'Female', accent: 'English (AU)' },
  { id: 'en-AU-WilliamNeural', label: 'William', gender: 'Male', accent: 'English (AU)' },
  { id: 'en-IE-EmilyNeural', label: 'Emily', gender: 'Female', accent: 'English (IE)' },
  { id: 'en-IN-NeerjaNeural', label: 'Neerja', gender: 'Female', accent: 'English (IN)' },
  { id: 'en-IN-PrabhatNeural', label: 'Prabhat', gender: 'Male', accent: 'English (IN)' },
]

function audioResponse(buf: Buffer, etag: string): NextResponse {
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: `"${etag}"`,
    },
  })
}

export async function GET() {
  return NextResponse.json({
    engine: 'edge-tts (server-side, via own OpenEir server)',
    defaultVoice: DEFAULT_EDGE_VOICE,
    maxText: MAX_TEXT,
    voices: VOICES,
  })
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const parsed = SpeakSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request', detail: parsed.error.issues[0]?.message }, { status: 400 })
  }

  const text = parsed.data.text
  const voice = parsed.data.voice ?? DEFAULT_EDGE_VOICE
  const rate = parsed.data.rate ?? 1
  const ratePct = rateToPct(rate)

  // Cache key: voice + rate + text (readbacks are formulaic → very high hit rate)
  const key = createHash('sha256').update(`${voice}|${ratePct}|${text}`).digest('hex').slice(0, 24)
  const file = path.join(CACHE_DIR, `${key}.mp3`)

  // If-None-Match short-circuit for repeat plays
  if (req.headers.get('if-none-match') === `"${key}"`) {
    return new NextResponse(null, { status: 304, headers: { ETag: `"${key}"` } })
  }

  try {
    const cached = await readFile(file)
    return audioResponse(cached, key)
  } catch { /* cache miss — synthesize below */ }

  const tts = new MsEdgeTTS({ enableLogger: false })
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3)
    const { audioStream } = tts.toStream(text, { rate: ratePct })
    const chunks: Buffer[] = []
    for await (const chunk of audioStream) chunks.push(chunk as Buffer)
    const buf = Buffer.concat(chunks)
    if (buf.length < 100) {
      return NextResponse.json({ error: 'tts_empty_audio' }, { status: 502 })
    }
    try {
      await mkdir(CACHE_DIR, { recursive: true })
      await writeFile(file, buf)
    } catch { /* read-only fs → still serve this request uncached */ }
    return audioResponse(buf, key)
  } catch (e) {
    console.error('[voice/tts] synthesis failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'tts_upstream' }, { status: 502 })
  } finally {
    try { tts.close() } catch { /* noop */ }
  }
}
