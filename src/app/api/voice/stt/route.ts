// OpenEir — server-side speech-to-text (the "server ear").
//
// The browser's Web Speech API phones home to the vendor (Google/Siri). When
// that path is blocked, rate-limited or simply absent (Firefox), the client
// captures a VAD-gated utterance with MediaRecorder and posts it here.
// Audio never lands on disk and is not stored; only the transcript comes back.
//
// Transcription backends, in order:
//   1. Built-in GLM gateway (z-ai-web-dev-sdk) — only when its config exists.
//   2. Any enabled openai_compatible provider's /audio/transcriptions
//      (OpenAI, OmniRoute, Groq, local whisper.cpp servers…). This keeps the
//      server ear alive for self-hosters who run providers — not just the
//      managed gateway.
//
//   POST /api/voice/stt  → { audio: base64, mime? } → { text, via }
//
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { decryptSecret } from '@/lib/crypto'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SttSchema = z.object({
  audio: z.string().min(64).max(12_000_000), // base64; ~9MB of audio ceiling
  mime: z.string().max(64).optional(),
})

const STT_TIMEOUT_MS = 45_000

/** Model candidates for OpenAI-style /audio/transcriptions endpoints. */
function sttModelCandidates(rowModel: string | null): string[] {
  const out: string[] = []
  if (rowModel && /whisper|audio|asr|speech|voice/i.test(rowModel)) out.push(rowModel)
  // generic OpenAI id first (OpenAI, most compatibles), then gateway-prefixed ids
  for (const m of ['whisper-1', 'groq/whisper-large-v3', 'whisper-large-v3']) {
    if (!out.includes(m)) out.push(m)
  }
  return out
}

/** Try the built-in GLM gateway. Returns null when it is simply not configured. */
async function transcribeBuiltin(audioB64: string): Promise<{ text: string } | null | undefined> {
  try {
    const { default: ZAI } = await import('z-ai-web-dev-sdk')
    const zai = await ZAI.create()
    const res = await zai.audio.asr.create({ file_base64: audioB64 })
    const text = (res?.text ?? '').trim()
    if (!text) return null
    return { text }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // "Configuration file not found" = no gateway on this box → fall through
    // to user-configured providers. Anything else is a real upstream error.
    if (/configuration file not found|not configured|no config/i.test(msg)) return undefined
    console.error('[voice/stt] builtin transcription failed:', msg)
    return undefined
  }
}

/** Try one openai_compatible provider's /audio/transcriptions. */
async function transcribeOpenAiCompatible(
  label: string, baseUrl: string, apiKey: string | null,
  audioB64: string, mime: string | undefined,
): Promise<{ text: string } | null> {
  const byteString = atob(audioB64)
  const bytes = new Uint8Array(byteString.length)
  for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i)
  const blob = new Blob([bytes], { type: mime || 'audio/webm' })

  let lastErr = ''
  for (const model of sttModelCandidates(null)) {
    try {
      const form = new FormData()
      form.append('file', blob, `utterance.${(mime || 'audio/webm').includes('mpeg') ? 'mp3' : 'webm'}`)
      form.append('model', model)
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/audio/transcriptions`, {
        method: 'POST',
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
        body: form,
        signal: AbortSignal.timeout(STT_TIMEOUT_MS),
      })
      if (!res.ok) {
        lastErr = `HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`
        continue
      }
      const json = await res.json() as { text?: string }
      const text = (json?.text ?? '').trim()
      if (text) return { text }
      lastErr = 'empty transcript'
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  console.error(`[voice/stt] provider "${label}" failed: ${lastErr}`)
  return null
}

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
  const { audio, mime } = parsed.data

  const attempted: string[] = []

  // 1) built-in gateway — silently skipped when unconfigured
  const builtin = await transcribeBuiltin(audio)
  if (builtin) return NextResponse.json({ text: builtin.text, via: 'builtin' })
  attempted.push('builtin')

  // 2) enabled openai_compatible providers, priority order
  const rows = await db.aiProviderConfig.findMany({
    where: { enabled: true, adapter: 'openai_compatible' },
    orderBy: [{ priority: 'asc' }, { isDefault: 'desc' }],
  })
  for (const row of rows) {
    if (!row.baseUrl) continue
    let apiKey: string | null = null
    try { apiKey = decryptSecret(row.apiKeyEnc) } catch { apiKey = null }
    const result = await transcribeOpenAiCompatible(
      row.label, row.baseUrl, apiKey, audio, mime,
    )
    if (result) {
      await db.aiProviderConfig.update({
        where: { id: row.id },
        data: { lastStatus: 'ok' },
      })
      return NextResponse.json({ text: result.text, via: row.label })
    }
    attempted.push(row.label)
  }

  console.error(`[voice/stt] all backends failed (attempted: ${attempted.join(', ') || 'none'})`)
  return NextResponse.json(
    { error: 'stt_upstream', attempted },
    { status: 502 },
  )
}
