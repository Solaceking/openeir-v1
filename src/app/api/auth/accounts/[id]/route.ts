// OpenEir — update / disable / delete an account (admin only).
// Guardrails: cannot disable or demote yourself, cannot remove the last admin.
import { ok, fail, parseBody } from '@/lib/api-utils'
import { z } from 'zod'
import { getSession, hashPassword, refreshAuthMode } from '@/lib/auth'
import { db } from '@/lib/db'

const patchSchema = z.object({
  displayName: z.string().max(60).optional(),
  role: z.enum(['admin', 'caregiver', 'viewer']).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (session?.role !== 'admin') return fail('Admin only', 403)
  const { id } = await params
  const parsed = await parseBody(req, patchSchema)
  if ('response' in parsed) return parsed.response
  const patch = parsed.data

  const target = await db.account.findUnique({ where: { id } })
  if (!target) return fail('Account not found', 404)

  if (target.id === session.accountId && (patch.role === 'viewer' || patch.role === 'caregiver' || patch.active === false)) {
    return fail('You cannot demote or disable your own account', 400)
  }
  if (target.role === 'admin' && (patch.role === 'caregiver' || patch.role === 'viewer' || patch.active === false)) {
    const admins = await db.account.count({ where: { role: 'admin', active: true } })
    if (admins <= 1) return fail('At least one active admin must remain', 400)
  }

  const account = await db.account.update({
    where: { id },
    data: {
      ...(patch.displayName !== undefined ? { displayName: patch.displayName.trim() || target.username } : {}),
      ...(patch.role ? { role: patch.role } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
      ...(patch.password ? { passwordHash: hashPassword(patch.password) } : {}),
    },
    select: { id: true, username: true, displayName: true, role: true, active: true },
  })
  // role changed / disabled → drop live sessions so the change bites immediately
  if (patch.role || patch.active === false || patch.password) {
    await db.authSession.deleteMany({ where: { accountId: id } })
  }
  await refreshAuthMode()
  return ok({ account })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (session?.role !== 'admin') return fail('Admin only', 403)
  const { id } = await params
  if (id === session.accountId) return fail('You cannot delete your own account', 400)

  const target = await db.account.findUnique({ where: { id } })
  if (!target) return fail('Account not found', 404)
  if (target.role === 'admin') {
    const admins = await db.account.count({ where: { role: 'admin', active: true } })
    if (admins <= 1) return fail('At least one active admin must remain', 400)
  }

  await db.account.delete({ where: { id } }) // sessions cascade
  const mode = await refreshAuthMode()
  return ok({ ok: true, mode })
}
