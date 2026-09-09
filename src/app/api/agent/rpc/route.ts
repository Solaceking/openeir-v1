// OpenEir — internal RPC for the realtime voice agent (Pipecat sidecar).
//
// The Python voice container holds NO business logic: every turn, every tool
// execution, every confirmation flows back into THIS app through here, so the
// tool-calling core, the confirm-before-write pipeline and the audit trail
// stay in exactly one place (src/lib/ai/chat-engine.ts + tools.ts).
//
// Auth: `Authorization: Bearer $OPENEIR_SERVICE_TOKEN` — REQUIRED, compared
// timing-safe, fail-closed when the env var is unset. The proxy lets /api/agent/
// through (LAN trust model), this route adds the token layer on top.

import { ok, fail, parseBody } from '@/lib/api-utils'
import { z } from 'zod'
import { timingSafeEqual } from 'crypto'
import { runTurn } from '@/lib/ai/chat-engine'
import {
  confirmPendingAction, declinePendingAction, getLiveVoiceSetting,
  toolsForPrompt, AGENT_TOOLS,
} from '@/lib/ai/tools'
import { db } from '@/lib/db'
import { publishRealtime } from '@/lib/events'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function tokenMatches(req: Request): boolean {
  const expected = process.env.OPENEIR_SERVICE_TOKEN
  if (!expected) return false // fail closed — no token configured, no RPC
  const provided = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

const rpcSchema = z.object({
  method: z.enum(['chat.turn', 'actions.pending', 'actions.confirm', 'actions.decline', 'config.live', 'tools.list']),
  params: z.record(z.string(), z.unknown()).default({}),
})

export async function POST(req: Request) {
  if (!tokenMatches(req)) {
    return fail('Forbidden — set OPENEIR_SERVICE_TOKEN on both the app and the voice agent', 403)
  }
  const parsed = await parseBody(req, rpcSchema)
  if ('response' in parsed) return parsed.response
  const { method, params } = parsed.data

  switch (method) {
    // The entire brain of the live conversation — same engine as text chat.
    case 'chat.turn': {
      const schema = z.object({
        text: z.string().trim().min(1).max(2000),
        sessionId: z.string().max(64).optional(),
        channel: z.enum(['voice']).default('voice'),
      })
      const p = schema.safeParse(params)
      if (!p.success) return fail('chat.turn: text is required (max 2000 chars)', 422)
      const turn = await runTurn({
        text: p.data.text,
        channel: p.data.channel,
        sessionId: p.data.sessionId,
        origin: 'realtime',
      })
      if (!turn.ok) {
        return ok({ ok: false, error: turn.error ?? 'Eir could not reply', sessionId: turn.sessionId })
      }
      // visual fallback: if the app is open, the pending cards surface there too
      for (const action of turn.pending) {
        publishRealtime('pending-action', action)
      }
      return ok({ ok: true, turn })
    }

    case 'actions.pending': {
      const rows = await db.pendingAction.findMany({
        where: { status: 'pending' },
        orderBy: { createdAt: 'desc' },
        take: 10,
      })
      return ok({
        ok: true,
        pending: rows.map((r) => ({ id: r.id, tool: r.tool, readback: r.readback, risk: r.risk, origin: r.origin, createdAt: r.createdAt.toISOString() })),
      })
    }

    // The spoken "yes" path — the human confirmation for realtime proposals.
    case 'actions.confirm': {
      const schema = z.object({ id: z.string().min(6), phrase: z.string().max(40).optional() })
      const p = schema.safeParse(params)
      if (!p.success) return fail('actions.confirm: id is required', 422)
      const out = await confirmPendingAction({ id: p.data.id, via: 'voice', phrase: p.data.phrase })
      return ok(out)
    }

    case 'actions.decline': {
      const schema = z.object({ id: z.string().min(6) })
      const p = schema.safeParse(params)
      if (!p.success) return fail('actions.decline: id is required', 422)
      const out = await declinePendingAction(p.data.id, 'voice')
      return ok(out)
    }

    // Engine configuration for the voice pipeline (pluggable STT/TTS lives in
    // app settings so users configure engines ONCE, not per service).
    case 'config.live': {
      const live = await getLiveVoiceSetting()
      let whisperUrl: string | null = null
      let whisperModel: string | null = null
      try {
        const row = await db.appSetting.findUnique({ where: { key: 'stt.routing' } })
        if (row) {
          const routing = JSON.parse(row.value) as { localUrl?: string; localModel?: string }
          whisperUrl = routing.localUrl ?? null
          whisperModel = routing.localModel ?? null
        }
      } catch { /* settings optional */ }
      return ok({ ok: true, live, stt: { whisperUrl, whisperModel }, deepgram: { configured: Boolean(process.env.DEEPGRAM_URL || process.env.DEEPGRAM_API_KEY) } })
    }

    case 'tools.list': {
      const live = { origin: 'realtime' as const, live: true }
      const offered = await toolsForPrompt(live)
      return ok({
        ok: true,
        offered: offered.map((t) => t.name),
        all: AGENT_TOOLS.map((t) => ({ name: t.name, category: t.category, risk: t.risk })),
      })
    }
  }
}
