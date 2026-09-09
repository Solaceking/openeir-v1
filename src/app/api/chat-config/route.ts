// OpenEir — chat behavior config API (Settings → Providers → Chat).
// GET  — any signed-in role (the Talk view may read defaults for display)
// PUT  — admin only (enforced here; proxy also gates)

import { ok, fail, parseBody } from '@/lib/api-utils'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { getChatConfig, saveChatConfig } from '@/lib/ai/chat-config'

export const dynamic = 'force-dynamic'

const putSchema = z.object({
  personaPreset: z.enum(['companion', 'clinician', 'coach', 'custom']).optional(),
  personaCustom: z.string().max(2000).optional(),
  verbosity: z.enum(['short', 'balanced', 'detailed']).optional(),
  temperature: z.number().min(0).max(1).optional(),
})

export async function GET() {
  return ok({ config: await getChatConfig() })
}

export async function PUT(req: Request) {
  const session = await getSession()
  if (session && session.role !== 'admin') return fail('Admins only', 403)
  const parsed = await parseBody(req, putSchema)
  if ('response' in parsed) return parsed.response
  return ok({ config: await saveChatConfig(parsed.data) })
}
