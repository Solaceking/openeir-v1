// OpenEir — synchronous "Ask Eir": builds full context, streams an answer
// back as an insight. Rate-limited; falls back gracefully when no provider.
import { db } from '@/lib/db'
import { ok, fail, parseBody, rateLimit, clientKey } from '@/lib/api-utils'
import { z } from 'zod'
import { buildHealthContext, contextForPrompt } from '@/lib/ai/context'
import { completeChat } from '@/lib/ai/providers'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const schema = z.object({ question: z.string().min(2).max(400) })

export async function POST(req: Request) {
  if (!rateLimit(clientKey(req, 'ask'), 8, 60_000)) return fail('Too many questions too fast — give Eir a moment.', 429)
  const parsed = await parseBody(req, schema)
  if ('response' in parsed) return parsed.response

  const ctx = await buildHealthContext()
  if (!ctx) return fail('Complete setup first', 400)

  const result = await completeChat('chat', [
    {
      role: 'system',
      content: 'You are Eir, the ambient health intelligence of the self-hosted OpenEir app. Answer the user\'s question about THEIR OWN health data in under 140 words. Be warm, specific and cite their actual numbers. Never diagnose. If something warrants medical attention, say so plainly. Plain text only.',
    },
    { role: 'user', content: `Question: ${parsed.data.question}\n\nHealth context: ${contextForPrompt(ctx, 'full')}` },
  ])

  if (!result.ok) {
    return fail('No AI provider reachable. Check Settings → AI providers.', 502, { attempted: result.attempted })
  }

  const insight = await db.insight.create({
    data: {
      kind: 'coach',
      severity: 'info',
      title: parsed.data.question.slice(0, 60),
      body: result.text.trim(),
      origin: 'ai',
      sourceEvent: 'MANUAL_QUERY',
    },
  })
  return ok({
    answer: result.text.trim(),
    provider: { label: result.providerLabel, model: result.model, latencyMs: result.latencyMs },
    insightId: insight.id,
  })
}
