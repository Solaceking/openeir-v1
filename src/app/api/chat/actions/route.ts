// OpenEir — the ONE confirmation door for pending agent actions.
// Every confirm/decline — chat card tap, realtime spoken "yes", RPC — goes
// through here, so the optimistic-lock execution, the high-risk phrase check
// and the audit trail cannot be bypassed by any mode.

import { ok, fail, parseBody } from '@/lib/api-utils'
import { z } from 'zod'
import { confirmPendingAction, declinePendingAction, getPendingAction } from '@/lib/ai/tools'

export const dynamic = 'force-dynamic'

const postSchema = z.object({
  id: z.string().min(6),
  decision: z.enum(['confirm', 'decline']),
  /** required (typed) for high-risk actions */
  phrase: z.string().max(40).optional(),
})

/** Card status refresh (also used after reload so stale snapshots resolve). */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return fail('Missing id', 400)
  const action = await getPendingAction(id)
  if (!action) return fail('Action not found', 404)
  return ok({ action })
}

export async function POST(req: Request) {
  const parsed = await parseBody(req, postSchema)
  if ('response' in parsed) return parsed.response
  const { id, decision, phrase } = parsed.data

  if (decision === 'decline') {
    const out = await declinePendingAction(id, 'card')
    if (!out.ok) return fail(out.reason, 409, { action: out.action })
    return ok({ action: out.action, result: out.result })
  }

  const out = await confirmPendingAction({ id, via: 'card', phrase })
  if (!out.ok) return fail(out.reason, 409, { action: out.action })
  return ok({ action: out.action, result: out.result })
}
