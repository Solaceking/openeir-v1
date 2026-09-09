// OpenEir — provider-agnostic AI abstraction layer.
// Adapters: openai_compatible | anthropic | ollama | cli
// The orchestrator never talks to a vendor directly — it asks this layer,
// which walks the fallback chain by priority and records usage/cost/latency.
//
// Tool-calling (v3.9): ChatOptions may carry a tool spec list plus an
// onToolCall handler. The layer runs the full tool loop internally for the
// two API adapters (Anthropic native tool_use, OpenAI-compatible tool_calls).
// Harnesses (cli) and providers that reject a tools param are skipped with a
// ToolsUnsupportedError so the chain can find a tool-capable provider; if the
// whole chain fails with tools, callers may retry once without them.

import { db } from '@/lib/db'
import { decryptSecret } from '@/lib/crypto'
import { callCliAgent } from '@/lib/ai/harness'

export interface ChatImage { mediaType: string; dataBase64: string }

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  /** Optional images (vision requests). Adapters translate to their wire format. */
  images?: ChatImage[]
  /** tool-loop fields — adapters translate to their wire format */
  toolCallId?: string // for role 'tool': which call this answers
  toolName?: string // for role 'tool': which tool answered
  toolCalls?: Array<{ id: string; name: string; args: string }> // for role 'assistant' with pending calls
}

/** Provider-neutral tool spec (translated per adapter). */
export interface ToolWireSpec {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ToolCallRequest {
  id: string
  name: string
  args: Record<string, unknown>
}

export interface ToolCallResponse {
  ok: boolean
  forModel: string
}

export interface ChatResult {
  ok: boolean
  text: string
  providerLabel: string
  model?: string | null
  latencyMs: number
  attempted: string[]
  /** true when the winning pass ran WITHOUT tools although tools were requested */
  toolsUnavailable?: boolean
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
  /** tool specs to offer (wire-neutral). Ignored by the cli adapter. */
  tools?: ToolWireSpec[]
  /** called for every tool_use the model emits; the reply becomes tool_result */
  onToolCall?: (req: ToolCallRequest) => Promise<ToolCallResponse>
  /** hard cap on model↔tool round trips (safety) */
  maxToolRounds?: number
}

const TIMEOUT_MS = 45_000
const MAX_TOOL_ROUNDS = 6

/** Raised when a provider/harness cannot do tool-calling — the chain walks on. */
export class ToolsUnsupportedError extends Error {
  constructor(msg: string) { super(msg); this.name = 'ToolsUnsupportedError' }
}

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

// ---------- wire translation: OpenAI-compatible ----------

type OpenAiWireMessage = Record<string, unknown>

function toOpenAiMessages(messages: ChatMessage[]): OpenAiWireMessage[] {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.toolCallId, content: m.content }
    }
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return {
        role: 'assistant',
        ...(m.content ? { content: m.content } : {}),
        tool_calls: m.toolCalls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: c.args },
        })),
      }
    }
    return { role: m.role, content: multimodalContent(m) }
  })
}

function openAiToolDefs(tools: ToolWireSpec[]) {
  return tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }))
}

// ---------- wire translation: Anthropic ----------

type AnthropicBlock = Record<string, unknown>

function toAnthropicMessages(messages: ChatMessage[]): Array<{ role: 'user' | 'assistant'; content: AnthropicBlock[] }> {
  const out: Array<{ role: 'user' | 'assistant'; content: AnthropicBlock[] }> = []
  for (const m of messages) {
    if (m.role === 'system') continue
    const role = m.role === 'assistant' ? 'assistant' : 'user'
    if (m.role === 'tool') {
      // tool results ride as user turns with tool_result blocks
      out.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: m.toolCallId, content: m.content }],
      })
      continue
    }
    const blocks: AnthropicBlock[] = [
      ...(m.images?.length
        ? m.images.map((img) => ({
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: img.mediaType, data: img.dataBase64 },
          }))
        : []),
      { type: 'text' as const, text: m.content },
    ]
    if (m.role === 'assistant' && m.toolCalls?.length) {
      // replace the text block with tool_use blocks (Anthropic expects them in the assistant turn)
      if (!m.content) blocks.length = 0
      blocks.push(...m.toolCalls.map((c) => ({
        type: 'tool_use' as const,
        id: c.id,
        name: c.name,
        input: safeJsonParse(c.args),
      })))
    }
    // merge consecutive same-role turns (Anthropic requires alternation)
    const last = out[out.length - 1]
    if (last && last.role === role) last.content.push(...blocks)
    else out.push({ role, content: blocks })
  }
  return out
}

function safeJsonParse(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s)
    return v && typeof v === 'object' ? v as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function anthropicToolDefs(tools: ToolWireSpec[]) {
  return tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }))
}

// ---------- adapter responses (tool-aware) ----------

interface AdapterReply {
  text: string | null
  toolCalls: Array<{ id: string; name: string; args: string }>
}

async function callOpenAiCompatible(
  row: ProviderRow, apiKey: string | null, messages: ChatMessage[], temperature: number,
  tools?: ToolWireSpec[],
): Promise<AdapterReply> {
  if (!row.baseUrl) throw new Error(`provider ${row.label} has no baseUrl`)
  const body: Record<string, unknown> = {
    model: row.model ?? 'default',
    messages: toOpenAiMessages(messages),
    temperature,
    stream: false,
  }
  if (tools?.length) body.tools = openAiToolDefs(tools)
  const res = await fetch(`${row.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) {
    const text = await res.text()
    if (tools?.length && res.status === 400 && /tool/i.test(text)) {
      throw new ToolsUnsupportedError(`provider ${row.label} rejected tools: ${text.slice(0, 120)}`)
    }
    throw new Error(`provider ${row.label} HTTP ${res.status}: ${text.slice(0, 180)}`)
  }
  const json = await res.json()
  const msg = json?.choices?.[0]?.message
  const calls: Array<{ id: string; name: string; args: string }> = (msg?.tool_calls ?? []).map((c: { id?: string; function?: { name?: string; arguments?: string } }) => ({
    id: c.id ?? `call_${Math.random().toString(36).slice(2, 10)}`,
    name: c.function?.name ?? '',
    args: c.function?.arguments ?? '{}',
  })).filter((c: { name: string }) => c.name)
  const text = typeof msg?.content === 'string' ? msg.content : null
  if (!text && !calls.length) throw new Error(`provider ${row.label} returned no content`)
  return { text, toolCalls: calls }
}

async function callAnthropic(
  row: ProviderRow, apiKey: string | null, messages: ChatMessage[], temperature: number,
  tools?: ToolWireSpec[],
): Promise<AdapterReply> {
  if (!apiKey) throw new Error(`provider ${row.label} needs an API key`)
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n')
  const body: Record<string, unknown> = {
    model: row.model ?? 'claude-3-5-haiku-latest',
    max_tokens: 1200,
    temperature,
    ...(system ? { system } : {}),
    messages: toAnthropicMessages(messages),
  }
  if (tools?.length) body.tools = anthropicToolDefs(tools)
  const res = await fetch(`${(row.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '')}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) {
    const text = await res.text()
    if (tools?.length && res.status === 400 && /tool/i.test(text)) {
      throw new ToolsUnsupportedError(`provider ${row.label} rejected tools: ${text.slice(0, 120)}`)
    }
    throw new Error(`provider ${row.label} HTTP ${res.status}`)
  }
  const json = await res.json()
  let text: string | null = null
  const calls: Array<{ id: string; name: string; args: string }> = []
  for (const block of json?.content ?? []) {
    if (block?.type === 'text' && typeof block.text === 'string') {
      text = text ? `${text}\n${block.text}` : block.text
    } else if (block?.type === 'tool_use') {
      calls.push({ id: block.id, name: block.name, args: JSON.stringify(block.input ?? {}) })
    }
  }
  if (!text && !calls.length) throw new Error(`provider ${row.label} returned no content`)
  return { text, toolCalls: calls }
}

/** Walk the fallback chain. Records AiUsage for every attempt.
 *  When options.tools is set, runs the tool loop against the first
 *  tool-capable provider; harnesses and tool-less providers are skipped. */
export async function completeChat(
  purpose: 'insight' | 'story' | 'whatif' | 'report' | 'chat' | 'ocr',
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<ChatResult> {
  const temperature = typeof options.temperature === 'number' && Number.isFinite(options.temperature)
    ? Math.min(1, Math.max(0, options.temperature))
    : 0.6
  const tools = options.tools?.length ? options.tools : undefined
  const maxRounds = Math.min(MAX_TOOL_ROUNDS, Math.max(1, options.maxToolRounds ?? MAX_TOOL_ROUNDS))
  // First boot on a fresh clone: materialize the built-in provider row without
  // requiring the demo-data seed script. Only when the chain is empty — a
  // user who deliberately disabled everything gets their choice respected.
  let rows: ProviderRow[] = await db.aiProviderConfig.findMany({
    where: { enabled: true },
    orderBy: [{ priority: 'asc' }, { isDefault: 'desc' }],
  })
  const attempted: string[] = []
  let sawToolsUnsupported = false
  for (const row of rows) {
    const started = Date.now()
    try {
      const apiKey = decryptSecret(row.apiKeyEnc)
      // Harnesses are text-only — fail fast (with a clear reason) so vision
      // requests fall through to an API provider instead of a garbled prompt.
      if (row.adapter === 'cli' && messages.some((m) => m.images?.length)) {
        throw new Error(`harness ${row.label} cannot carry images — configure an API provider for vision`)
      }
      const wantTools = Boolean(tools?.length)
      if (row.adapter === 'cli' && wantTools) {
        throw new ToolsUnsupportedError(`harness ${row.label} does not support tool-calling`)
      }
      let text: string
      let finalText: string | null = null
      if (row.adapter === 'anthropic') {
        const convo = [...messages]
        let round = 0
        for (;;) {
          const reply = await callAnthropic(row, apiKey, convo, temperature, wantTools ? tools : undefined)
          if (reply.toolCalls.length && wantTools && options.onToolCall && round < maxRounds) {
            convo.push({ role: 'assistant', content: '', toolCalls: reply.toolCalls })
            for (const call of reply.toolCalls) {
              const resp = await options.onToolCall({ id: call.id, name: call.name, args: safeJsonParse(call.args) })
              convo.push({ role: 'tool', toolCallId: call.id, toolName: call.name, content: resp.forModel })
            }
            round++
            continue
          }
          finalText = reply.text ?? ''
          break
        }
        text = finalText
      } else if (row.adapter === 'cli') {
        const systemText = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n')
        const userText = messages.filter((m) => m.role !== 'system').map((m) => m.content).join('\n\n')
        text = await callCliAgent(row.model ?? 'claude', systemText, userText)
      } else {
        const convo = [...messages]
        let round = 0
        for (;;) {
          const reply = await callOpenAiCompatible(row, apiKey, convo, temperature, wantTools ? tools : undefined)
          if (reply.toolCalls.length && wantTools && options.onToolCall && round < maxRounds) {
            convo.push({ role: 'assistant', content: reply.text ?? '', toolCalls: reply.toolCalls })
            for (const call of reply.toolCalls) {
              const resp = await options.onToolCall({ id: call.id, name: call.name, args: safeJsonParse(call.args) })
              convo.push({ role: 'tool', toolCallId: call.id, toolName: call.name, content: resp.forModel })
            }
            round++
            continue
          }
          finalText = reply.text
          break
        }
        text = finalText ?? ''
      }
      const latency = Date.now() - started
      await db.aiUsage.create({
        data: { providerLabel: row.label, model: row.model, purpose, latencyMs: latency, ok: true },
      })
      await db.aiProviderConfig.update({
        where: { id: row.id },
        data: { lastStatus: 'ok', lastLatencyMs: latency },
      })
      return {
        ok: true,
        text: (text ?? '').trim(),
        providerLabel: row.label,
        model: row.model,
        latencyMs: latency,
        attempted,
        toolsUnavailable: wantTools && sawToolsUnsupported && attempted.length > 0,
      }
    } catch (err) {
      const latency = Date.now() - started
      let msg = err instanceof Error ? err.message : String(err)
      if (err instanceof ToolsUnsupportedError) sawToolsUnsupported = true
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

// ---------- streaming (SSE) ----------

export interface StreamChatOptions extends ChatOptions {
  /** called per text delta as it arrives — table-stakes chat UX */
  onDelta?: (delta: string) => void | Promise<void>
}

async function* sseDataLines(res: Response): AsyncGenerator<string> {
  if (!res.body) throw new Error('stream response has no body')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).replace(/\r$/, '')
      buf = buf.slice(idx + 1)
      if (line.startsWith('data: ')) yield line.slice(6)
    }
  }
  const tail = buf.trim()
  if (tail.startsWith('data: ')) yield tail.slice(6)
}

interface AdapterStreamReply {
  text: string | null
  toolCalls: Array<{ id: string; name: string; args: string }>
}

async function streamOpenAiCompatible(
  row: ProviderRow, apiKey: string | null, messages: ChatMessage[], temperature: number,
  tools: ToolWireSpec[] | undefined, onDelta?: (d: string) => void | Promise<void>,
): Promise<AdapterStreamReply> {
  if (!row.baseUrl) throw new Error(`provider ${row.label} has no baseUrl`)
  const body: Record<string, unknown> = {
    model: row.model ?? 'default',
    messages: toOpenAiMessages(messages),
    temperature,
    stream: true,
  }
  if (tools?.length) body.tools = openAiToolDefs(tools)
  const res = await fetch(`${row.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS * 2),
  })
  if (!res.ok) {
    const text = await res.text()
    if (tools?.length && res.status === 400 && /tool/i.test(text)) {
      throw new ToolsUnsupportedError(`provider ${row.label} rejected tools: ${text.slice(0, 120)}`)
    }
    throw new Error(`provider ${row.label} HTTP ${res.status}: ${text.slice(0, 180)}`)
  }

  let content = ''
  let finish = ''
  const slots = new Map<number, { id: string; name: string; args: string }>()
  for await (const data of sseDataLines(res)) {
    if (data === '[DONE]') break
    let j: {
      choices?: Array<{ delta?: { content?: string | null; tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> }; finish_reason?: string | null }>
    }
    try { j = JSON.parse(data) } catch { continue }
    const choice = j?.choices?.[0]
    if (choice?.finish_reason) finish = choice.finish_reason
    const delta = choice?.delta
    if (typeof delta?.content === 'string' && delta.content) {
      content += delta.content
      await onDelta?.(delta.content)
    }
    for (const tc of delta?.tool_calls ?? []) {
      const i = tc.index ?? 0
      const slot = slots.get(i) ?? { id: '', name: '', args: '' }
      if (tc.id) slot.id = tc.id
      if (tc.function?.name) slot.name += tc.function.name
      if (tc.function?.arguments) slot.args += tc.function.arguments
      slots.set(i, slot)
    }
  }
  const toolCalls = [...slots.values()].filter((s) => s.name)
  if (!content && !toolCalls.length && finish !== 'stop') {
    throw new Error(`provider ${row.label} stream ended without content`)
  }
  return { text: content || null, toolCalls }
}

async function streamAnthropic(
  row: ProviderRow, apiKey: string | null, messages: ChatMessage[], temperature: number,
  tools: ToolWireSpec[] | undefined, onDelta?: (d: string) => void | Promise<void>,
): Promise<AdapterStreamReply> {
  if (!apiKey) throw new Error(`provider ${row.label} needs an API key`)
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n')
  const body: Record<string, unknown> = {
    model: row.model ?? 'claude-3-5-haiku-latest',
    max_tokens: 1200,
    temperature,
    stream: true,
    ...(system ? { system } : {}),
    messages: toAnthropicMessages(messages),
  }
  if (tools?.length) body.tools = anthropicToolDefs(tools)
  const res = await fetch(`${(row.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '')}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS * 2),
  })
  if (!res.ok) {
    const text = await res.text()
    if (tools?.length && res.status === 400 && /tool/i.test(text)) {
      throw new ToolsUnsupportedError(`provider ${row.label} rejected tools: ${text.slice(0, 120)}`)
    }
    throw new Error(`provider ${row.label} HTTP ${res.status}`)
  }

  let text: string | null = null
  let stopReason = ''
  const blocks = new Map<number, { type: string; id?: string; name?: string; json: string; text: string }>()
  for await (const data of sseDataLines(res)) {
    let j: {
      type?: string
      index?: number
      content_block?: { type: string; id?: string; name?: string }
      delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string }
    }
    try { j = JSON.parse(data) } catch { continue }
    if (j.type === 'content_block_start' && j.content_block) {
      blocks.set(j.index ?? 0, { type: j.content_block.type, id: j.content_block.id, name: j.content_block.name, json: '', text: '' })
    } else if (j.type === 'content_block_delta' && j.delta) {
      const b = blocks.get(j.index ?? 0)
      if (!b) continue
      if (j.delta.type === 'text_delta' && j.delta.text) {
        b.text += j.delta.text
        text = text === null ? j.delta.text : text + j.delta.text
        await onDelta?.(j.delta.text)
      } else if (j.delta.type === 'input_json_delta' && j.delta.partial_json) {
        b.json += j.delta.partial_json
      }
    } else if (j.type === 'message_delta' && j.delta?.stop_reason) {
      stopReason = j.delta.stop_reason
    }
  }
  const toolCalls = [...blocks.values()]
    .filter((b) => b.type === 'tool_use' && b.name)
    .map((b) => ({ id: b.id ?? `tu_${Math.random().toString(36).slice(2, 10)}`, name: b.name!, args: b.json || '{}' }))
  if (!text && !toolCalls.length && stopReason !== 'end_turn') {
    throw new Error(`provider ${row.label} stream ended without content`)
  }
  return { text, toolCalls }
}

/** Streaming sibling of completeChat: identical chain-walk, tool loop and
 *  usage accounting, but text deltas are pushed to onDelta as they arrive. */
export async function streamChat(
  purpose: 'insight' | 'story' | 'whatif' | 'report' | 'chat' | 'ocr',
  messages: ChatMessage[],
  options: StreamChatOptions = {},
): Promise<ChatResult> {
  const temperature = typeof options.temperature === 'number' && Number.isFinite(options.temperature)
    ? Math.min(1, Math.max(0, options.temperature))
    : 0.6
  const tools = options.tools?.length ? options.tools : undefined
  const maxRounds = Math.min(MAX_TOOL_ROUNDS, Math.max(1, options.maxToolRounds ?? MAX_TOOL_ROUNDS))
  let rows: ProviderRow[] = await db.aiProviderConfig.findMany({
    where: { enabled: true },
    orderBy: [{ priority: 'asc' }, { isDefault: 'desc' }],
  })
  const attempted: string[] = []
  let sawToolsUnsupported = false
  for (const row of rows) {
    const started = Date.now()
    try {
      const apiKey = decryptSecret(row.apiKeyEnc)
      if (row.adapter === 'cli' && messages.some((m) => m.images?.length)) {
        throw new Error(`harness ${row.label} cannot carry images — configure an API provider for vision`)
      }
      const wantTools = Boolean(tools?.length)
      if (row.adapter === 'cli' && wantTools) {
        throw new ToolsUnsupportedError(`harness ${row.label} does not support tool-calling`)
      }

      let finalText = ''
      if (row.adapter === 'anthropic') {
        const convo = [...messages]
        let round = 0
        for (;;) {
          const reply = await streamAnthropic(row, apiKey, convo, temperature, wantTools ? tools : undefined, options.onDelta)
          if (reply.toolCalls.length && wantTools && options.onToolCall && round < maxRounds) {
            convo.push({ role: 'assistant', content: reply.text ?? '', toolCalls: reply.toolCalls })
            for (const call of reply.toolCalls) {
              const resp = await options.onToolCall({ id: call.id, name: call.name, args: safeJsonParse(call.args) })
              convo.push({ role: 'tool', toolCallId: call.id, toolName: call.name, content: resp.forModel })
            }
            round++
            continue
          }
          finalText = reply.text ?? ''
          break
        }
      } else if (row.adapter === 'cli') {
        // harnesses cannot stream — fall back to the buffered call, delivered as one delta
        const systemText = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n')
        const userText = messages.filter((m) => m.role !== 'system').map((m) => m.content).join('\n\n')
        finalText = await callCliAgent(row.model ?? 'claude', systemText, userText)
        await options.onDelta?.(finalText)
      } else {
        const convo = [...messages]
        let round = 0
        for (;;) {
          const reply = await streamOpenAiCompatible(row, apiKey, convo, temperature, wantTools ? tools : undefined, options.onDelta)
          if (reply.toolCalls.length && wantTools && options.onToolCall && round < maxRounds) {
            convo.push({ role: 'assistant', content: reply.text ?? '', toolCalls: reply.toolCalls })
            for (const call of reply.toolCalls) {
              const resp = await options.onToolCall({ id: call.id, name: call.name, args: safeJsonParse(call.args) })
              convo.push({ role: 'tool', toolCallId: call.id, toolName: call.name, content: resp.forModel })
            }
            round++
            continue
          }
          finalText = reply.text ?? ''
          break
        }
      }

      const latency = Date.now() - started
      await db.aiUsage.create({
        data: { providerLabel: row.label, model: row.model, purpose, latencyMs: latency, ok: true },
      })
      await db.aiProviderConfig.update({
        where: { id: row.id },
        data: { lastStatus: 'ok', lastLatencyMs: latency },
      })
      return {
        ok: true,
        text: finalText.trim(),
        providerLabel: row.label,
        model: row.model,
        latencyMs: latency,
        attempted,
        toolsUnavailable: wantTools && sawToolsUnsupported && attempted.length > 0,
      }
    } catch (err) {
      const latency = Date.now() - started
      let msg = err instanceof Error ? err.message : String(err)
      if (err instanceof ToolsUnsupportedError) sawToolsUnsupported = true
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
