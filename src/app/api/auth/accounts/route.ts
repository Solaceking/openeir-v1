// OpenEir — account management (admin only; middleware enforces role too).
import { ok, fail, parseBody } from '@/lib/api-utils'
import { z } from 'zod'
import { getSession, getAuthMode, hashPassword, refreshAuthMode } from '@/lib/auth'
import { db } from '@/lib/db'
import { ROLES, type Role } from '@/lib/nav'

const createSchema = z.object({
  username: z.string().min(2).max(40).regex(/^[a-z0-9._-]+$/, 'lowercase letters, digits, . _ - only'),
  password: z.string().min(8).max(200),
  displayName: z.string().max(60).optional(),
  role: z.enum(['admin', 'caregiver', 'viewer']),
})

/** Admin gate that also permits BOOTSTRAP: in open household mode there is no
 *  session yet, and creating the very first account must be possible. */
async function isAdminOrBootstrapping() {
  const mode = await getAuthMode()
  if (mode === 'open') return true
  const session = await getSession()
  return session?.role === 'admin'
}

export async function GET() {
  if (!(await isAdminOrBootstrapping())) return fail('Admin only', 403)
  const accounts = await db.account.findMany({
    select: { id: true, username: true, displayName: true, role: true, active: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: 'asc' },
  })
  return ok({ accounts, mode: await getAuthMode() })
}

export async function POST(req: Request) {
  if (!(await isAdminOrBootstrapping())) return fail('Admin only', 403)
  const parsed = await parseBody(req, createSchema)
  if ('response' in parsed) return parsed.response
  const { username, password, displayName } = parsed.data

  // the first account is always an admin — it owns the instance
  const existing = await db.account.count()
  const role: Role = existing === 0 ? 'admin' : parsed.data.role

  const exists = await db.account.findUnique({ where: { username } })
  if (exists) return fail('That username is taken', 409)

  const account = await db.account.create({
    data: {
      username,
      passwordHash: hashPassword(password),
      role,
      displayName: displayName?.trim() || username,
    },
    select: { id: true, username: true, displayName: true, role: true, active: true, createdAt: true },
  })
  const mode = await refreshAuthMode()
  return ok({ account, mode })
}
