// OpenEir — provider-agnostic AI abstraction layer.
// Adapters: openai_compatible | anthropic | ollama | cli
// The orchestrator never talks to a vendor directly — it asks this layer,
// which walks the fallback chain by priority and records usage/cost/latency.

import { db } from '@/lib/db'
import { decryptSecret } from '@/lib/crypto'
import { callCliAgent } from '@/lib/ai/harness'

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

/** Extra request knobs (Settings → Providers → Chat). Defaults = v3.4 behavior. */
export interface ChatOptions {
  /** 0..1, default 0.6 (the previously hardcoded value) */
  temperature?: number
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

async function callOpenAiCompatible(row: ProviderRow, apiKey: string | null, messages: ChatMessage[], temperature: number): Promise<string> {
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
      temperature,
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

async function callAnthropic(row: ProviderRow, apiKey: string | null, messages: ChatMessage[], temperature: number): Promise<string> {
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
      temperature,
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
  options: ChatOptions = {},
): Promise<ChatResult> {
  const temperature = typeof options.temperature === 'number' && Number.isFinite(options.temperature)
    ? Math.min(1, Math.max(0, options.temperature))
    : 0.6
  // First boot on a fresh clone: materialize the built-in provider row without
  // requiring the demo-data seed script. Only when the chain is empty — a
  // user who deliberately disabled everything gets their choice respected.
  let rows: ProviderRow[] = await db.aiProviderConfig.findMany({
    where: { enabled: true },
    orderBy: [{ priority: 'asc' }, { isDefault: 'desc' }],
  })
  const attempted: string[] = []
  for (const row of rows) {
    const started = Date.now()
    try {
      const apiKey = decryptSecret(row.apiKeyEnc)
      // Harnesses are text-only — fail fast (with a clear reason) so vision
      // requests fall through to an API provider instead of a garbled prompt.
      if (row.adapter === 'cli' && messages.some((m) => m.images?.length)) {
        throw new Error(`harness ${row.label} cannot carry images — configure an API provider for vision`)
      }
      const systemText = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n')
      const userText = messages.filter((m) => m.role !== 'system').map((m) => m.content).join('\n\n')
      let text: string
      if (row.adapter === 'anthropic') text = await callAnthropic(row, apiKey, messages, temperature)
      else if (row.adapter === 'cli') text = await callCliAgent(row.model ?? 'claude', systemText, userText)
      else text = await callOpenAiCompatible(row, apiKey, messages, temperature) // openai_compatible & ollama
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
      let msg = err instanceof Error ? err.message : String(err)
      // Agentic-harness-only models (OpenRouter free tier, e.g. *:free ids that
      // require an agent client) — say exactly that instead of a raw 403 dump.
      if (/only available on agentic harnesses/i.test(msg)) {
        msg = `${row.label}: model is restricted to agentic harness clients (Claude Code, Codex, Cursor…) by the upstream provider — pick a regular model, or route through an Agent harness in Settings → AI`
      }
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

/** One-line readiness check (kept for API shape; no hidden gateway exists anymore). */
export async function builtinStatusSummary(): Promise<{ configured: boolean; source: string | null; checkedPaths: string[] }> {
  return { configured: false, source: null, checkedPaths: [] }
}

/** Strip likely-PII when privacy mode is on. */
export function applyPrivacyMode(text: string, privacyMode: boolean): string {
  if (!privacyMode) return text
  return text
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, '[email]')
    .replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[phone]')
    .replace(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, (m) => (['Alex Morgan'].includes(m) ? 'the user' : m))
}
