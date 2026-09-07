// OpenEir — public auth status (does this instance require sign-in?).
import { ok } from '@/lib/api-utils'
import { getAuthMode } from '@/lib/auth'

export async function GET() {
  return ok({ mode: await getAuthMode() })
}
