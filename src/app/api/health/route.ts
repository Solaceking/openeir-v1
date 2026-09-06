import { ok } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

export async function GET() {
  return ok({
    status: 'ok',
    app: 'OpenEir',
    version: '1.0.0',
    time: new Date().toISOString(),
  })
}
