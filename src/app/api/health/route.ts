import { ok } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

export async function GET() {
  return ok({
    status: 'ok',
    app: 'OpenEir',
    version: process.env.APP_VERSION ?? 'unknown',
    time: new Date().toISOString(),
  })
}
