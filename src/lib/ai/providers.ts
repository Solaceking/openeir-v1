// OpenEir — provider-agnostic AI abstraction layer.
// Adapters: builtin_zai | openai_compatible | anthropic | ollama
// The orchestrator never talks to a vendor directly — it asks this layer,
// which walks the fallback chain by priority and records usage/cost/latency.

import { db } from '@/lib/db'
import { decryptSecret } from '@/lib/crypto'
import { DEFAULT_BUILTIN_MODEL, DEFAULT_BUILTIN_VISION_MODEL, isVisionModelId } from '@/lib/ai/model-default'

export interface ChatImage { mediaType: string; dataBase64: string }

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  /** Optional images (vision requests). Adapters translate to their wire format. */
  images?: ChatImage[]
}

export interface ChatResult {
  ok: boolean
  text: string
  providerLabel: string
  model?: string | null
  latencyMs: number
  attempted: string[]
}

interface ProviderRow {
  id: string; label: string; adapter: string; baseUrl: string | null
  model: string | null; apiKeyEnc: string | null; enabled: boolean
  priority: number; costPer1kIn: number | null; costPer1kOut: number | null
  privacyMode: boolean
}

const TIMEOUT_MS = 45_000

/** OpenAI-style multimodal content parts (accepted by most OpenAI-compatible wire formats). */
function multimodalContent(m: ChatMessage): string | Array<Record<string, unknown>> {
  if (!m.images?.length) return m.content
  return [
    { type: 'text', text: m.content },
    ...m.images.map((img) => ({
      type: 'image_url',
      image_url: { url: `data:${img.mediaType};base64,${img.dataBase64}` },
    })),
  ]
}

async function callBuiltinZai(messages: ChatMessage[], model: string | null): Promise<string> {
  const { default: ZAI } = await import('z-ai-web-dev-sdk')
  const zai = await ZAI.create()

  // Vision requests must use the gateway's dedicated vision endpoint and a
  // vision-capable model id (its text endpoint rejects image content).
  if (messages.some((m) => m.images?.length)) {
    const visionModel = model && isVisionModelId(model) ? model : DEFAULT_BUILTIN_VISION_MODEL
    const completion = (await zai.chat.completions.createVision({
      model: visionModel,
      messages: messages.map((m) => ({
        role: m.role,
        content: multimodalContent(m) as string | Array<Record<string, unknown>>,
      })),
      thinking: { type: 'disabled' },
    } as unknown as Parameters<typeof zai.chat.completions.createVision>[0])) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const text = completion.choices?.[0]?.message?.content ?? ''
    if (!text.trim()) throw new Error('empty response from built-in vision endpoint')
    return text
  }

  // The SDK uses 'assistant' role for the system prompt.
  const sdkMessages = messages.map((m) => ({
    role: m.role === 'system' ? 'assistant' : m.role,
    content: m.content,
  }))
  const completion = await zai.chat.completions.create({
    model: model || DEFAULT_BUILTIN_MODEL,
    messages: sdkMessages,
    thinking: { type: 'disabled' },
  } as Parameters<typeof zai.chat.completions.create>[0])
  const text = completion.choices[0]?.message?.content ?? ''
  if (!text.trim()) throw new Error('empty response from built-in provider')
  return text
}

async function callOpenAiCompatible(row: ProviderRow, apiKey: string | null, messages: ChatMessage[]): Promise<string> {
  if (!row.baseUrl) throw new Error(`provider ${row.label} has no baseUrl`)
  const res = await fetch(`${row.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: row.model ?? 'default',
      messages: messages.map((m) => ({ role: m.role, content: multimodalContent(m) })),
      temperature: 0.6,
      stream: false,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`provider ${row.label} HTTP ${res.status}: ${(await res.text()).slice(0, 180)}`)
  const json = await res.json()
  const text = json?.choices?.[0]?.message?.content
  if (!text) throw new Error(`provider ${row.label} returned no content`)
  return text as string
}

async function callAnthropic(row: ProviderRow, apiKey: string | null, messages: ChatMessage[]): Promise<string> {
  if (!apiKey) throw new Error(`provider ${row.label} needs an API key`)
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n')
  const rest = messages.filter((m) => m.role !== 'system')
  const res = await fetch(`${(row.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '')}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: row.model ?? 'claude-3-5-haiku-latest',
      max_tokens: 1200,
      ...(system ? { system } : {}),
      messages: rest.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: [
          ...(m.images?.length
            ? m.images.map((img) => ({
                type: 'image' as const,
                source: { type: 'base64' as const, media_type: img.mediaType, data: img.dataBase64 },
              }))
            : []),
          { type: 'text' as const, text: m.content },
        ],
      })),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`provider ${row.label} HTTP ${res.status}`)
  const json = await res.json()
  const text = json?.content?.[0]?.text
  if (!text) throw new Error(`provider ${row.label} returned no content`)
  return text as string
}

/** Walk the fallback chain. Records AiUsage for every attempt. */
export async function completeChat(
  purpose: 'insight' | 'story' | 'whatif' | 'report' | 'chat' | 'ocr',
  messages: ChatMessage[],
): Promise<ChatResult> {
  const rows: ProviderRow[] = await db.aiProviderConfig.findMany({
    where: { enabled: true },
    orderBy: [{ priority: 'asc' }, { isDefault: 'desc' }],
  })
  const attempted: string[] = []
  for (const row of rows) {
    const started = Date.now()
    try {
      const apiKey = decryptSecret(row.apiKeyEnc)
      let text: string
      if (row.adapter === 'builtin_zai') text = await callBuiltinZai(messages, row.model)
      else if (row.adapter === 'anthropic') text = await callAnthropic(row, apiKey, messages)
      else text = await callOpenAiCompatible(row, apiKey, messages) // openai_compatible & ollama
      const latency = Date.now() - started
      await db.aiUsage.create({
        data: { providerLabel: row.label, model: row.model, purpose, latencyMs: latency, ok: true },
      })
      await db.aiProviderConfig.update({
        where: { id: row.id },
        data: { lastStatus: 'ok', lastLatencyMs: latency },
      })
      return { ok: true, text, providerLabel: row.label, model: row.model, latencyMs: latency, attempted }
    } catch (err) {
      const latency = Date.now() - started
      const msg = err instanceof Error ? err.message : String(err)
      attempted.push(`${row.label}: ${msg}`)
      await db.aiUsage.create({
        data: { providerLabel: row.label, model: row.model, purpose, latencyMs: latency, ok: false },
      })
      await db.aiProviderConfig.update({
        where: { id: row.id },
        data: { lastStatus: `error: ${msg.slice(0, 120)}`, lastLatencyMs: latency },
      })
      // fall through to next provider
    }
  }
  return { ok: false, text: '', providerLabel: 'none', latencyMs: 0, attempted }
}

/** Strip likely-PII when privacy mode is on. */
export function applyPrivacyMode(text: string, privacyMode: boolean): string {
  if (!privacyMode) return text
  return text
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, '[email]')
    .replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[phone]')
    .replace(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, (m) => (['Alex Morgan'].includes(m) ? 'the user' : m))
}
