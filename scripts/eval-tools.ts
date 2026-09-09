// OpenEir — tool-calling eval runner.
//
//   bun run eval:tools
//
// Phase 1 (always runs, no provider needed): the deterministic parser
// fast-path must keep detecting the core intents at card-grade confidence.
// This is the CI backstop — a parser regression here fails the build.
//
// Phase 2 (needs a provider): runs realistic phrasings against the
// configured model WITH the real tool registry and checks the model reaches
// for the right tool. Configure via env:
//
//   OPENEIR_EVAL_OPENAI="baseUrl|apiKey|model"
//   OPENEIR_EVAL_ANTHROPIC="apiKey|model"
//
// No provider configured → the tool phase is skipped with an honest note
// (CI stays green; the parser backstop still runs).
//
// The eval NEVER executes writes: onToolCall captures the proposed call and
// returns "eval capture" — nothing touches data.

import { execSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import path from 'node:path'

// hermetic scratch db (same trick as the test preload)
const scratch = path.resolve('evals/.scratch.db')
process.env.DATABASE_URL = `file:${scratch}`
process.env.APP_KEY ??= 'openeir-eval-key'
try { rmSync(scratch) } catch { /* absent */ }
execSync('bunx prisma db push --skip-generate --force-reset', { env: { ...process.env }, stdio: 'pipe' })

const { parseVoiceCommand } = await import('../src/lib/voice/parser')
const { completeChat } = await import('../src/lib/ai/providers')
const { toolsForPrompt } = await import('../src/lib/ai/tools')
const { PARSER_FIXTURES, TOOL_FIXTURES } = await import('../evals/tool-calling/fixtures')
const { db } = await import('../src/lib/db')

let pass = 0
let failCount = 0
const failures: string[] = []

// ---------- phase 1: deterministic parser backstop ----------

console.log(`\nparser fast-path: ${PARSER_FIXTURES.length} fixtures`)
for (const f of PARSER_FIXTURES) {
  let intent
  try {
    intent = parseVoiceCommand(f.text)
  } catch {
    intent = { kind: 'unknown', confidence: 0 }
  }
  const kindOk = intent.kind === f.expectKind
  const cardOk = f.expectCard ? intent.confidence >= 0.55 : intent.confidence < 0.55
  if (kindOk && cardOk) {
    pass++
  } else {
    failCount++
    failures.push(`PARSER "${f.text}" → kind=${intent.kind} conf=${intent.confidence} (expected ${f.expectKind}, card=${f.expectCard})`)
  }
}

// ---------- phase 2: model tool-choice (provider-gated) ----------

interface EvalProvider { label: string; adapter: 'openai_compatible' | 'anthropic'; baseUrl: string | null; apiKey: string; model: string }

function evalProviders(): EvalProvider[] {
  const out: EvalProvider[] = []
  const oai = process.env.OPENEIR_EVAL_OPENAI
  if (oai) {
    const [baseUrl, apiKey, model] = oai.split('|')
    if (baseUrl && apiKey && model) out.push({ label: `eval:${model}`, adapter: 'openai_compatible', baseUrl, apiKey, model })
  }
  const ant = process.env.OPENEIR_EVAL_ANTHROPIC
  if (ant) {
    const [apiKey, model] = ant.split('|')
    if (apiKey && model) out.push({ label: `eval:${model}`, adapter: 'anthropic', baseUrl: null, apiKey, model })
  }
  return out
}

const providers = evalProviders()
if (!providers.length) {
  console.log('\ntool-choice eval: SKIPPED — set OPENEIR_EVAL_OPENAI="baseUrl|key|model" or OPENEIR_EVAL_ANTHROPIC="key|model" to run it')
} else {
  for (const p of providers) {
    console.log(`\ntool-choice eval on ${p.label}: ${TOOL_FIXTURES.length} fixtures`)
    await db.aiProviderConfig.deleteMany({})
    await db.aiProviderConfig.create({
      data: {
        label: 'eval-provider',
        adapter: p.adapter,
        baseUrl: p.baseUrl,
        model: p.model,
        apiKeyEnc: (await import('../src/lib/crypto')).encryptSecret(p.apiKey),
        enabled: true,
        priority: 0,
      },
    })

    const offered = await toolsForPrompt({ origin: 'chat', live: true })
    for (const f of TOOL_FIXTURES) {
      const calls: Array<{ name: string; args: Record<string, unknown> }> = []
      let replied = ''
      const result = await completeChat('chat', [
        { role: 'system', content: 'You are Eir, a health assistant. Use tools when they would answer or act. Current date is today.' },
        { role: 'user', content: f.text },
      ], {
        temperature: 0,
        tools: offered,
        onToolCall: async (req) => {
          calls.push({ name: req.name, args: req.args })
          // eval captures; NEVER executes
          return { ok: true, forModel: 'eval capture — assume the tool worked' }
        },
      })
      replied = result.ok ? result.text : `(provider failed: ${result.attempted[0]?.slice(0, 80)})`

      const acceptable = [f.expectTool, ...(f.alsoAcceptable ?? [])]
      const parserWins = acceptable.includes('__parser__')
      const noneOk = acceptable.includes('__none__')
      const madeCall = calls.length > 0
      const called = calls.map((c) => c.name)

      let ok = false
      let detail = ''
      if (!madeCall) {
        ok = noneOk || parserWins // parser fast-path owning it is fine
        detail = madeCall ? '' : 'no tool call'
      } else {
        ok = called.some((n) => acceptable.includes(n))
        detail = `called ${called.join(', ')}`
      }

      // arg subset check (loose)
      if (ok && f.expectArgs) {
        const hit = calls.find((c) => acceptable.includes(c.name))
        if (hit) {
          for (const [k, v] of Object.entries(f.expectArgs)) {
            if (hit.args[k] !== undefined && hit.args[k] !== v) {
              ok = false
              detail += ` (arg ${k}=${JSON.stringify(hit.args[k])}, expected ${JSON.stringify(v)})`
            }
          }
        }
      }

      if (ok) pass++
      else {
        failCount++
        failures.push(`TOOL ${p.label} "${f.text}" → ${detail} | reply: ${replied.slice(0, 60)}`)
      }
    }
  }
}

// ---------- report ----------

console.log(`\neval: ${pass} pass, ${failCount} fail`)
if (failures.length) {
  console.log('\nfailures:')
  for (const f of failures) console.log(`  ✗ ${f}`)
}
await db.$disconnect()
process.exit(failCount > 0 ? 1 : 0)
