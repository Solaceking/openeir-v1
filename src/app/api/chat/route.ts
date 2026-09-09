// OpenEir — the Talk tab's HTTP door into the conversation engine.
// All conversation logic (deterministic fast-path, tool-calling loop,
// confirm-before-write, audit, injection hardening) lives in
// src/lib/ai/chat-engine.ts and is shared with the SSE stream route and the
// realtime voice agent's RPC — one brain, many doors.

import { db } from '@/lib/db'
import { ok, fail, parseBody, rateLimit, clientKey } from '@/lib/api-utils'
import { z } from 'zod'
import { runTurn } from '@/lib/ai/chat-engine'
import { extractDeterministic, storeMemories, aiExtract } from '@/lib/memory'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const postSchema = z.object({
  text: z.string().trim().min(1).max(1200),
  channel: z.enum(['text', 'voice']).default('text'),
  sessionId: z.string().min(1).max(64).optional(),
  /** optional attachments: images go to the vision path, files arrive as extracted text */
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

export async function GET(req: Request) {
  const url = new URL(req.url)
  const sessionId = url.searchParams.get('sessionId')
  // default view = the CURRENT session (newest message's session)
  let sid = sessionId
  if (!sid) {
    const newest = await db.chatMessage.findFirst({ orderBy: { createdAt: 'desc' } })
    sid = newest?.sessionId ?? null
  }
  const rows = sid
    ? await db.chatMessage.findMany({ where: { sessionId: sid }, orderBy: { createdAt: 'asc' }, take: 200 })
    : []
  return ok({ messages: rows, sessionId: sid })
}

export async function POST(req: Request) {
  if (!rateLimit(clientKey(req, 'chat'), 20, 60_000)) {
    return fail('Eir needs a breath — try again in a moment.', 429)
  }
  const parsed = await parseBody(req, postSchema)
  if ('response' in parsed) return parsed.response
  const { text, channel, images, fileText } = parsed.data

  const turn = await runTurn({ text, channel, images, fileText, origin: 'chat' })
  if (!turn.ok) {
    return fail(turn.error ?? 'Eir could not reply', turn.status ?? 502, { attempted: turn.attempted })
  }

  // Memory writing is strictly post-reply and best-effort: deterministic
  // patterns first, AI extractor only for substantial turns.
  void (async () => {
    try {
      await storeMemories(extractDeterministic(text), turn.userMessageId!)
      if (text.length >= 40) await aiExtract(text, turn.reply!, turn.userMessageId!)
    } catch { /* never break the chat response over memory */ }
  })()

  return ok({
    userMessageId: turn.userMessageId,
    reply: turn.reply,
    replyId: turn.replyId,
    sessionId: turn.sessionId,
    provider: turn.provider,
    detected: turn.detected,
    pending: turn.pending,
    toolEvents: turn.toolEvents,
    toolsUnavailable: turn.toolsUnavailable,
  })
}

export async function DELETE(req: Request) {
  // scoped clear: current session only (?all=1 keeps the legacy full wipe)
  const url = new URL(req.url)
  const sessionId = url.searchParams.get('sessionId')
  if (sessionId) {
    await db.chatMessage.deleteMany({ where: { sessionId } })
    return ok({ cleared: sessionId })
  }
  await db.chatMessage.deleteMany({})
  return ok({ cleared: 'all' })
}
