// OpenEir — who am I? Used by the shell to gate navigation by role.
// In open household mode the implicit owner has admin powers.
import { ok } from '@/lib/api-utils'
import { getSession, getAuthMode } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const mode = await getAuthMode()
  const session = await getSession()
  if (mode === 'open' || !session) {
    return ok({ mode, account: null, role: mode === 'open' ? 'admin' : null })
  }
  const account = await db.account.findUnique({
    where: { id: session.accountId },
    select: { totpEnabled: true },
  })
  return ok({
    mode,
    role: session.role,
    account: { id: session.accountId, username: session.username, displayName: session.displayName, role: session.role, totpEnabled: !!account?.totpEnabled },
  })
}
