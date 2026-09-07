// OpenEir — POST login · GET auth status · DELETE logout (single route keeps
// the client surface tiny: /api/auth/login, /api/auth/status, logout = DELETE).
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ok, fail, parseBody, rateLimit, clientKey } from '@/lib/api-utils'
import {
  verifyPassword, createSession, destroySession,
  getAuthMode, SESSION_COOKIE, SESSION_COOKIE_OPTS,
} from '@/lib/auth'
import { db } from '@/lib/db'

const loginSchema = z.object({
  username: z.string().min(1).max(60),
  password: z.string().min(1).max(200),
})

export async function GET() {
  return ok({ mode: await getAuthMode() })
}

export async function POST(req: Request) {
  if (!rateLimit(clientKey(req, 'login'), 10, 60_000)) {
    return fail('Too many attempts — wait a minute', 429)
  }
  const parsed = await parseBody(req, loginSchema)
  if ('response' in parsed) return parsed.response
  const { username, password } = parsed.data

  const account = await db.account.findUnique({ where: { username: username.trim().toLowerCase() } })
  // uniform error — never reveal whether the username exists
  if (!account || !account.active || !verifyPassword(password, account.passwordHash)) {
    return fail('Wrong username or password', 401)
  }

  const token = await createSession(account.id, req.headers.get('user-agent'))
  const res = NextResponse.json({
    account: {
      id: account.id,
      username: account.username,
      role: account.role,
      displayName: account.displayName || account.username,
    },
  })
  res.cookies.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTS)
  return res
}

export async function DELETE() {
  await destroySession()
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', { ...SESSION_COOKIE_OPTS, maxAge: 0 })
  return res
}
