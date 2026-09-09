// OpenEir — SSE streaming chat. Same engine as POST /api/chat (one brain),
// but the reply streams token-by-token and tool events / pending cards are
// pushed as they happen — the user never wonders whether Eir is thinking or
// DOING something.
//
// Wire format (one JSON object per `data:` line):
//   { type: 'user',      id }
//   { type: 'delta',     text }          — incremental reply text
//   { type: 'tool',      event }         — { tool, verb, latencyMs, ok }
//   { type: 'pending',   action }        — a confirmation card is ready
//   { type: 'done',      replyId, provider, pending, toolEvents, toolsUnavailable }
//   { type: 'error',     error }

import { parseBody, fail } from '@/lib/api-utils'
import { z } from 'zod'
import { runTurnStream } from '@/lib/ai/chat-engine'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const postSchema = z.object({
  text: z.string().trim().min(1).max(1200),
  channel: z.enum(['text', 'voice']).default('text'),
  sessionId: z.string().min(1).max(64).optional(),
  images: z.array(z.object({
    mediaType: z.string().max(64),
    dataBase64: z.string().min(16).max(6_000_000),
    name: z.string().max(120).optional(),
  })).max(3).optional(),
  fileText: z.object({
    name: z.string().max(120),
    excerpt: z.string().max(20_000),
  }).optional(),
})

export async function POST(req: Request) {
  const parsed = await parseBody(req, postSchema)
  if ('response' in parsed) return parsed.response
  const { text, channel, images, fileText, sessionId } = parsed.data

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
      }
      let closed = false
      try {
        const turn = await runTurnStream(
          { text, channel, images, fileText, sessionId: sessionId ?? undefined, origin: 'chat' },
          {
            onDelta: async (delta) => { if (!closed) send({ type: 'delta', text: delta }) },
            onToolEvent: async (ev) => { if (!closed) send({ type: 'tool', event: ev }) },
            onPending: async (p) => { if (!closed) send({ type: 'pending', action: p }) },
          },
        )
        if (!turn.ok) {
          send({ type: 'error', error: turn.error ?? 'Eir could not reply', attempted: turn.attempted })
        } else {
          send({
            type: 'done',
            replyId: turn.replyId,
            userMessageId: turn.userMessageId,
            sessionId: turn.sessionId,
            provider: turn.provider,
            detected: turn.detected,
            pending: turn.pending,
            toolEvents: turn.toolEvents,
            toolsUnavailable: turn.toolsUnavailable,
          })
        }
      } catch (err) {
        send({ type: 'error', error: err instanceof Error ? err.message : 'stream failed' })
      } finally {
        closed = true
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
