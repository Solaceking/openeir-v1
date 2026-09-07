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

const STT_TIMEOUT_MS = 45_000        // cloud backends: fast or never
const STT_TIMEOUT_LOCAL_MS = 300_000 // self-hosted whisper on CPU can be slow — worth the wait

// ---- user-configurable STT routing (Settings → Voice & audio) -------------
// Stored in AppSetting: { order: ['local','builtin','gateway'], localUrl, localModel }
// Every id may be included or omitted — the user's list IS the priority chain.
// Defaults keep the pre-selection behavior: builtin first, then any gateway.
interface SttRouting {
  order: string[]
  localUrl: string
  localModel: string
}

const DEFAULT_ROUTING: SttRouting = {
  order: ['builtin', 'gateway'],
  localUrl: 'http://localhost:8630/v1',
  localModel: 'large-v3',
}

async function getRouting(): Promise<SttRouting> {
  const row = await db.appSetting.findUnique({ where: { key: 'stt.routing' } })
  if (!row?.value) return DEFAULT_ROUTING
  try {
    const parsed = JSON.parse(row.value) as Partial<SttRouting>
    return {
      order: Array.isArray(parsed.order) && parsed.order.length ? parsed.order : DEFAULT_ROUTING.order,
      localUrl: parsed.localUrl || DEFAULT_ROUTING.localUrl,
      localModel: parsed.localModel || DEFAULT_ROUTING.localModel,
    }
  } catch {
    return DEFAULT_ROUTING
  }
}

export async function GET() {
  const routing = await getRouting()
  return NextResponse.json({ routing })
}

export async function PUT(req: NextRequest) {
  const parsed = z.object({
    order: z.array(z.enum(['local', 'builtin', 'gateway'])).min(1).max(3),
    localUrl: z.string().url().optional(),
    localModel: z.string().max(80).optional(),
  }).safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const current = await getRouting()
  const routing: SttRouting = {
    order: parsed.data.order,
    localUrl: parsed.data.localUrl ?? current.localUrl,
    localModel: parsed.data.localModel ?? current.localModel,
  }
  await db.appSetting.upsert({
    where: { key: 'stt.routing' },
    update: { value: JSON.stringify(routing) },
    create: { key: 'stt.routing', value: JSON.stringify(routing) },
  })
  return NextResponse.json({ routing })
}

// ---- transcription backends -------------------------------------------------

const STT_MODEL_CANDIDATES = ['whisper-1', 'groq/whisper-large-v3', 'whisper-large-v3']

/** One OpenAI-style /audio/transcriptions call. Returns null on failure. */
async function transcribeOpenAiStyle(
  label: string,
  baseUrl: string,
  apiKey: string | null,
  audioB64: string,
  mime: string | undefined,
  modelOverride?: string,
  timeoutMs = STT_TIMEOUT_MS,
): Promise<{ text: string } | null> {
  const byteString = atob(audioB64)
  const bytes = new Uint8Array(byteString.length)
  for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i)
  const ext = (mime || '').includes('mpeg') ? 'mp3' : (mime || '').includes('wav') ? 'wav' : 'webm'
  const blob = new Blob([bytes], { type: mime || 'audio/webm' })
  // explicit override → only that model (local servers know their own model);
  // no override → probe common cloud model ids
  const models = modelOverride ? [modelOverride] : STT_MODEL_CANDIDATES

  let lastErr = ''
  for (const model of models) {
    try {
      const form = new FormData()
      form.append('file', blob, `utterance.${ext}`)
      form.append('model', model)
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/audio/transcriptions`, {
        method: 'POST',
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
        body: form,
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) {
        lastErr = `HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`
        continue
      }
      const json = (await res.json()) as { text?: string }
      const text = (json?.text ?? '').trim()
      if (text) return { text }
      lastErr = 'empty transcript'
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  console.error(`[voice/stt] ${label} failed: ${lastErr}`)
  return null
}

/** Built-in GLM gateway. undefined = not configured (skip silently). */
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
    if (/configuration file not found|not configured|no config/i.test(msg)) return undefined
    console.error('[voice/stt] builtin failed:', msg)
    return undefined
  }
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const parsed = SttSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const { audio, mime } = parsed.data
  const routing = await getRouting()
  const attempted: string[] = []

  for (const backend of routing.order) {
    if (backend === 'local') {
      const result = await transcribeOpenAiStyle(
        'local whisper', routing.localUrl, null, audio, mime, routing.localModel, STT_TIMEOUT_LOCAL_MS,
      )
      if (result) return NextResponse.json({ text: result.text, via: 'local' })
      attempted.push('local')
    } else if (backend === 'builtin') {
      const result = await transcribeBuiltin(audio)
      if (result) return NextResponse.json({ text: result.text, via: 'builtin' })
      // undefined = unconfigured → skipped without being counted as an attempt
      if (result === null) attempted.push('builtin')
    } else if (backend === 'gateway') {
      const rows = await db.aiProviderConfig.findMany({
        where: { enabled: true, adapter: 'openai_compatible' },
        orderBy: [{ priority: 'asc' }, { isDefault: 'desc' }],
      })
      for (const row of rows) {
        if (!row.baseUrl) continue
        let apiKey: string | null = null
        try { apiKey = decryptSecret(row.apiKeyEnc) } catch { apiKey = null }
        const result = await transcribeOpenAiStyle(
          `gateway:${row.label}`, row.baseUrl, apiKey, audio, mime,
        )
        if (result) {
          await db.aiProviderConfig.update({ where: { id: row.id }, data: { lastStatus: 'ok' } })
          return NextResponse.json({ text: result.text, via: `gateway:${row.label}` })
        }
      }
      attempted.push('gateway')
    }
  }

  console.error(`[voice/stt] all backends failed (attempted: ${attempted.join(', ') || 'none'})`)
  return NextResponse.json({ error: 'stt_upstream', attempted }, { status: 502 })
}
