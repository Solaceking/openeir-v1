// Adapter wire-format tests: the tool-calling loop for both API adapters,
// with scripted fetch responses. No network, no vendor keys.

import { describe, test, expect, beforeEach } from 'bun:test'
import { db } from '@/lib/db'
import { completeChat, type ChatMessage, type ToolCallRequest, type ToolWireSpec } from '@/lib/ai/providers'
import { encryptSecret } from '@/lib/crypto'

const TOOLS: ToolWireSpec[] = [
  {
    name: 'getLatestReading',
    description: 'Get latest reading',
    parameters: { type: 'object', properties: { kind: { type: 'string' } } },
  },
  {
    name: 'logBloodPressure',
    description: 'Log BP',
    parameters: { type: 'object', properties: { systolic: { type: 'number' }, diastolic: { type: 'number' } }, required: ['systolic'] },
  },
]

const scripted: { respond: (url: string, body: any) => { status: number; body: unknown } } = {
  respond: () => ({ status: 500, body: 'no script' }),
}

let seenRequests: Array<{ url: string; body: any }> = []

beforeEach(async () => {
  seenRequests = []
  scripted.respond = () => ({ status: 500, body: 'no script' })
  // fresh provider chain per test
  await db.aiProviderConfig.deleteMany({})
  await db.aiUsage.deleteMany({})

  // @ts-expect-error — bun allows reassigning fetch
  globalThis.fetch = async (input: any, init?: any) => {
    const url = String(input)
    const body = init?.body ? JSON.parse(init.body) : null
    seenRequests.push({ url, body })
    if (url.includes('/emit')) return new Response('ok', { status: 200 })
    const out = scripted.respond(url, body)
    return new Response(JSON.stringify(out.body), { status: out.status, headers: { 'Content-Type': 'application/json' } })
  }
})

type ProviderSeed = Partial<{ adapter: string; label: string; baseUrl: string | null; model: string | null; apiKeyEnc: string | null; priority: number }>

function seedProviders(rows: ProviderSeed[]) {
  return Promise.all(rows.map((r, i) => db.aiProviderConfig.create({
    data: {
      label: r.label ?? `p${i}`,
      adapter: r.adapter ?? 'openai_compatible',
      baseUrl: r.baseUrl ?? null,
      model: r.model ?? 'test-model',
      apiKeyEnc: r.apiKeyEnc ?? null,
      enabled: true,
      priority: r.priority ?? i,
    },
  })))
}

const openAiOk = (text: string) => ({ status: 200, body: { choices: [{ message: { role: 'assistant', content: text } }] } })
const openAiToolCall = (id: string, name: string, args: unknown) => ({
  status: 200,
  body: { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] },
})
const anthropicOk = (text: string) => ({ status: 200, body: { content: [{ type: 'text', text }] } })
const anthropicToolUse = (id: string, name: string, args: unknown) => ({
  status: 200,
  body: { content: [{ type: 'tool_use', id, name, input: args }] },
})

describe('OpenAI-compatible tool loop', () => {
  test('offers function tools, executes the handler, feeds tool results back', async () => {
    await seedProviders([{ adapter: 'openai_compatible', baseUrl: 'http://mock/v1' }])
    const calls: ToolCallRequest[] = []
    let round = 0
    scripted.respond = (_url, body) => {
      round++
      if (round === 1) {
        expect(body.tools).toEqual([
          { type: 'function', function: { name: 'getLatestReading', description: 'Get latest reading', parameters: TOOLS[0].parameters } },
          { type: 'function', function: { name: 'logBloodPressure', description: 'Log BP', parameters: TOOLS[1].parameters } },
        ])
        return openAiToolCall('call_1', 'getLatestReading', { kind: 'bp' })
      }
      // second request must carry the tool result as a role:'tool' message
      const toolMsg = body.messages.find((m: any) => m.role === 'tool')
      expect(toolMsg).toBeDefined()
      expect(toolMsg.tool_call_id).toBe('call_1')
      expect(toolMsg.content).toContain('118/76')
      return openAiOk('Your last reading was 118/76.')
    }

    const result = await completeChat('chat', [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'what was my last reading?' },
    ], {
      tools: TOOLS,
      onToolCall: async (req) => {
        calls.push(req)
        expect(req.name).toBe('getLatestReading')
        expect(req.args.kind).toBe('bp')
        return { ok: true, forModel: 'Latest BP 118/76 at 10:00' }
      },
    })
    expect(result.ok).toBe(true)
    expect(result.text).toBe('Your last reading was 118/76.')
    expect(calls).toHaveLength(1)
    expect(seenRequests.length).toBeGreaterThanOrEqual(2)
  })

  test('provider that rejects the tools param (400) falls through the chain', async () => {
    await seedProviders([
      { adapter: 'openai_compatible', baseUrl: 'http://mock-a/v1', label: 'no-tools' },
      { adapter: 'openai_compatible', baseUrl: 'http://mock-b/v1', label: 'has-tools' },
    ])
    let hits = 0
    scripted.respond = (url) => {
      if (url.includes('mock-a')) return { status: 400, body: { error: { message: 'tools is not supported by this model' } } }
      hits++
      return openAiOk('hello from provider B')
    }
    const result = await completeChat('chat', [{ role: 'user', content: 'hi' }], { tools: TOOLS, onToolCall: async () => ({ ok: true, forModel: '' }) })
    expect(result.ok).toBe(true)
    expect(result.providerLabel).toBe('has-tools')
    expect(hits).toBe(1)
  })

  test('CLI harness is skipped for tool requests (honest unsupported error)', async () => {
    await seedProviders([{ adapter: 'cli', label: 'harness', baseUrl: null }])
    const result = await completeChat('chat', [{ role: 'user', content: 'hi' }], { tools: TOOLS, onToolCall: async () => ({ ok: true, forModel: '' }) })
    expect(result.ok).toBe(false)
    expect(result.attempted.join(' ')).toContain('does not support tool-calling')
  })
})

describe('Anthropic tool loop', () => {
  test('uses native tool_use / tool_result blocks', async () => {
    await seedProviders([{ adapter: 'anthropic', apiKeyEnc: encryptSecret('sk-ant-test') }])
    let round = 0
    scripted.respond = (_url, body) => {
      round++
      if (round === 1) {
        expect(body.tools[0].name).toBe('getLatestReading')
        expect(body.tools[0].input_schema.type).toBe('object')
        return anthropicToolUse('tu_1', 'logBloodPressure', { systolic: 120, diastolic: 80 })
      }
      // follow-up must contain the assistant tool_use + user tool_result pair
      const assistant = body.messages.find((m: any) => m.role === 'assistant' && m.content.some((b: any) => b.type === 'tool_use'))
      expect(assistant).toBeDefined()
      const toolResult = body.messages.find((m: any) => m.role === 'user' && m.content.some((b: any) => b.type === 'tool_result'))
      expect(toolResult).toBeDefined()
      expect(toolResult.content[0].tool_use_id).toBe('tu_1')
      expect(toolResult.content[0].content).toContain('Confirmation required')
      return anthropicOk('I prepared that BP entry for you — confirm it when ready.')
    }

    const result = await completeChat('chat', [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'log 120 over 80' },
    ], {
      tools: TOOLS,
      onToolCall: async (req) => {
        expect(req.name).toBe('logBloodPressure')
        return { ok: true, forModel: 'Confirmation required — nothing is saved yet. Prepared: log BP 120/80.' }
      },
    })
    expect(result.ok).toBe(true)
    expect(result.text).toContain('confirm it when ready')
  })
})

describe('degradation', () => {
  test('chat without tools still works exactly as before', async () => {
    await seedProviders([{ adapter: 'openai_compatible', baseUrl: 'http://mock/v1' }])
    scripted.respond = () => openAiOk('plain text reply')
    const messages: ChatMessage[] = [{ role: 'user', content: 'hello' }]
    const result = await completeChat('chat', messages, {})
    expect(result.ok).toBe(true)
    expect(result.text).toBe('plain text reply')
  })

  test('whole chain down → ok:false with attempted reasons', async () => {
    await seedProviders([{ adapter: 'openai_compatible', baseUrl: 'http://mock/v1' }])
    scripted.respond = () => ({ status: 503, body: { error: 'down' } })
    const result = await completeChat('chat', [{ role: 'user', content: 'hi' }], {})
    expect(result.ok).toBe(false)
    expect(result.attempted.length).toBeGreaterThan(0)
  })
})
