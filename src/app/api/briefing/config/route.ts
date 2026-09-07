// OpenEir — Morning Briefing schedule config.
import { ok, parseBody } from '@/lib/api-utils'
import { getBriefingConfig, setBriefingConfig } from '@/lib/briefing-config'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const configSchema = z.object({
  enabled: z.boolean(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  push: z.boolean(),
})

export async function GET() {
  return ok(await getBriefingConfig())
}

export async function PUT(req: Request) {
  const parsed = await parseBody(req, configSchema)
  if ('response' in parsed) return parsed.response
  await setBriefingConfig(parsed.data)
  return ok(parsed.data)
}
