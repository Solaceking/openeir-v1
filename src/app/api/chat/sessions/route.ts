import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, rateLimit, clientKey } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Conversation sessions — archives of past Talk threads. The active thread is
// simply the session with endedAt=null; "New chat" ends it, "clear" deletes it.
// Honest & simple: a session is a contiguous thread with a title, nothing more.

const MAX_FILE_BYTES = 8 * 1024 * 1024
const EXTRACT_CAP = 12_000 // chars of extracted text handed to the model
const TEXT_TYPES = new Set(['text/plain', 'text/markdown', 'text/csv', 'application/json', 'text/html'])

const PostSchema = z.object({
  action: z.enum(['end', 'title', 'delete', 'restore']),
  sessionId: z.string().min(1).max(64),
  title: z.string().trim().max(80).optional(),
})

/** Extract readable text from an uploaded file (PDF via unpdf, else utf-8). */
export async function extractFileText(file: File): Promise<{ text: string; how: string }> {
  const name = (file.name || '').toLowerCase()
  const buf = Buffer.from(await file.arrayBuffer())
  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    const { extractText, getDocumentProxy } = await import('unpdf')
    const pdf = await getDocumentProxy(new Uint8Array(buf))
    const { text } = await extractText(pdf, { mergePages: true })
    return { text: (text || '').trim(), how: 'pdf' }
  }
  if (TEXT_TYPES.has(file.type) || name.match(/\.(txt|md|markdown|csv|json|log)$/)) {
    return { text: buf.toString('utf-8').trim(), how: 'text' }
  }
  return { text: '', how: 'unsupported' }
}

export function fileAllowed(file: File): boolean {
  const name = (file.name || '').toLowerCase()
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return true
  if (TEXT_TYPES.has(file.type)) return true
  if (name.match(/\.(txt|md|markdown|csv|json|log)$/)) return true
  if (file.type.startsWith('image/')) return true
  return false
}

export async function GET() {
  const sessions = await db.chatMessage.groupBy({
    by: ['sessionId'],
    _count: { _all: true },
    _max: { createdAt: true },
    orderBy: { _max: { createdAt: 'desc' } },
    take: 60,
  })
  interface SessionSummary { id: string; count: number; lastAt: Date | null; title: string | null }
  const out: SessionSummary[] = []
  for (const s of sessions) {
    const first = await db.chatMessage.findFirst({
      where: { sessionId: s.sessionId },
      orderBy: { createdAt: 'asc' },
    })
    out.push({
      id: s.sessionId,
      count: s._count._all,
      lastAt: s._max.createdAt,
      title: first ? JSON.parse(first.meta || '{}').sessionTitle || null : null,
    })
  }
  return ok({ sessions: out })
}

export async function POST(req: NextRequest) {
  if (!rateLimit(clientKey(req, 'chat-sessions'), 30, 60_000)) return fail('Too many requests', 429)
  const parsed = PostSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return fail('invalid_request', { status: 400 } as never)
  const { action, sessionId, title } = parsed.data

  // Titles live on the first message's meta — sessions are grouped messages,
  // not a separate table; keeps the schema honest and the migration zero-cost.
  if (action === 'title') {
    const first = await db.chatMessage.findFirst({ where: { sessionId }, orderBy: { createdAt: 'asc' } })
    if (!first) return fail('Session not found', 404)
    const meta = JSON.parse(first.meta || '{}')
    meta.sessionTitle = title || 'Untitled chat'
    await db.chatMessage.update({ where: { id: first.id }, data: { meta: JSON.stringify(meta) } })
    return ok({ titled: true })
  }
  if (action === 'delete') {
    await db.chatMessage.deleteMany({ where: { sessionId } })
    return ok({ deleted: true })
  }
  return fail('unknown_action', 400)
}
