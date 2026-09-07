// OpenEir — who am I? Used by the shell to gate navigation by role.
// In open household mode the implicit owner has admin powers.
import { ok } from '@/lib/api-utils'
import { getSession, getAuthMode } from '@/lib/auth'

export async function GET() {
  const mode = await getAuthMode()
  const session = await getSession()
  if (mode === 'open' || !session) {
    return ok({ mode, account: null, role: mode === 'open' ? 'admin' : null })
  }
  return ok({
    mode,
    role: session.role,
    account: { id: session.accountId, username: session.username, displayName: session.displayName, role: session.role },
  })
}
