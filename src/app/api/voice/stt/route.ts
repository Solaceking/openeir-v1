// OpenEir — server-side speech-to-text (the "server ear").
//
// The browser's Web Speech API phones home to the vendor (Google/Siri). When
// that path is blocked, rate-limited or simply absent (Firefox), the client
// captures a VAD-gated utterance with MediaRecorder and posts it here. The
// built-in GLM gateway transcribes it — audio never lands on disk and is not
// stored; only the transcript comes back.
//
//   POST /api/voice/stt  → { audio: base64, mime? } → { text }
//
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SttSchema = z.object({
  audio: z.string().min(64).max(12_000_000), // base64; ~9MB of audio ceiling
  mime: z.string().max(64).optional(),
})

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const parsed = SttSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const { default: ZAI } = await import('z-ai-web-dev-sdk')
  try {
    const zai = await ZAI.create()
    const res = await zai.audio.asr.create({ file_base64: parsed.data.audio })
    const text = (res?.text ?? '').trim()
    if (!text) {
      return NextResponse.json({ error: 'empty_transcript' }, { status: 422 })
    }
    return NextResponse.json({ text })
  } catch (e) {
    console.error('[voice/stt] transcription failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'stt_upstream' }, { status: 502 })
  }
}
