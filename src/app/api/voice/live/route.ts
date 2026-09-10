// OpenEir — "Live conversation" setting (Settings → Providers → Audio).
// OFF by default: a portion of OpenEir's audience (elderly users, caregivers
// setting this up for someone else) is best served by the predictable
// tap-to-talk button. Turning this on switches the Talk orb to the opt-in
// Pipecat realtime agent (docker compose --profile voice) — hands-free,
// interruptible, server-side VAD. Push-to-talk is untouched either way.

import { ok, fail, parseBody } from '@/lib/api-utils'
import { z } from 'zod'
import { getLiveVoiceSetting } from '@/lib/ai/tools'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

const putSchema = z.object({
  enabled: z.boolean().optional(),
  sttEngine: z.enum(['local_whisper', 'deepgram_selfhosted']).optional(),
  ttsEngine: z.enum(['edge', 'piper', 'openai_compat', 'deepgram']).optional(),
  rate: z.number().min(0.6).max(1.6).optional(),
})

export async function GET() {
  const live = await getLiveVoiceSetting()
  // the Pipecat container is optional infra — the rewrite only exists when
  // VOICE_AGENT_URL was set at build/start time
  const serviceAvailable = Boolean(process.env.VOICE_AGENT_URL)
  // Also surface the user's stored Edge voice preference so the
  // voice container can speak with exactly the voice the user chose.
  // This is client-side persisted (zustand localStorage), so read it
  // here by reading the cookie-free HTTP header — actually read from
  // the browser-agnostic store file is not possible server-side.
  // Instead return the default; the container's _ensure_voice() fetches
  // the catalog default and the user's edgeVoice flows through the
  // browser's own WebRTC path. For now we return the catalog default
  // as a conservative server-side choice.
  return ok({ live, serviceAvailable })
}

export async function PUT(req: Request) {
  const parsed = await parseBody(req, putSchema)
  if ('response' in parsed) return parsed.response
  const patch = parsed.data

  const current = await getLiveVoiceSetting()
  const next = {
    enabled: patch.enabled ?? current.enabled,
    sttEngine: patch.sttEngine ?? current.sttEngine,
    ttsEngine: patch.ttsEngine ?? current.ttsEngine,
    rate: patch.rate ?? current.rate,
  }
  await db.appSetting.upsert({
    where: { key: 'voice.live' },
    update: { value: JSON.stringify(next) },
    create: { key: 'voice.live', value: JSON.stringify(next) },
  })
  return ok({ live: next })
}
