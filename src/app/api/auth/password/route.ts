// OpenEir — change my own password (any signed-in role).
import { ok, fail, parseBody, rateLimit, clientKey } from '@/lib/api-utils'
import { z } from 'zod'
import { getSession, hashPassword, verifyPassword } from '@/lib/auth'
import { db } from '@/lib/db'

const schema = z.object({
  current: z.string().min(1).max(200),
  next: z.string().min(8).max(200),
})

export async function PUT(req: Request) {
  if (!rateLimit(clientKey(req, 'pw'), 10, 60_000)) return fail('Too many attempts', 429)
  const session = await getSession()
  if (!session) return fail('Sign in first', 401)
  const parsed = await parseBody(req, schema)
  if ('response' in parsed) return parsed.response

  const account = await db.account.findUnique({ where: { id: session.accountId } })
  if (!account || !verifyPassword(parsed.data.current, account.passwordHash)) {
    return fail('Current password is wrong', 403)
  }
  await db.account.update({
    where: { id: account.id },
    data: { passwordHash: hashPassword(parsed.data.next) },
  })
  return ok({ ok: true })
}
