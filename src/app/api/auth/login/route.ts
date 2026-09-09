// OpenEir — POST login · GET auth status · DELETE logout (single route keeps
// the client surface tiny: /api/auth/login, /api/auth/status, logout = DELETE).
//
// Two-factor flow: password-only accounts get a session straight away; accounts
// with TOTP enabled get a short-lived signed challenge and must replay the
// password with `challenge` + `code` (authenticator code or backup code) to
// mint the session. The whole exchange stays rate-limited and uniform-error.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ok, fail, parseBody, rateLimit, clientKey } from '@/lib/api-utils'
import {
  verifyPassword, createSession, destroySession,
  getAuthMode, SESSION_COOKIE, SESSION_COOKIE_OPTS,
} from '@/lib/auth'
import { db } from '@/lib/db'
import {
  challengeSecret, makeChallengeToken, readChallengeToken,
  verifyTotp, matchBackupCode,
} from '@/lib/totp'

const loginSchema = z.object({
  username: z.string().min(1).max(60),
  password: z.string().min(1).max(200),
  challenge: z.string().max(500).optional(), // second step only
  code: z.string().max(20).optional(), // TOTP or backup code
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
  const { username, password, challenge, code } = parsed.data

  const account = await db.account.findUnique({ where: { username: username.trim().toLowerCase() } })
  // uniform error — never reveal whether the username exists
  if (!account || !account.active || !verifyPassword(password, account.passwordHash)) {
    return fail('Wrong username or password', 401)
  }

  // ----- second factor required → hand out a challenge, no session yet -----
  if (account.totpEnabled) {
    if (!challenge || !code) {
      const secret = await challengeSecret()
      return ok({
        totpRequired: true,
        challenge: makeChallengeToken(account.id, secret),
        hint: 'Enter the 6-digit code from your authenticator app',
      })
    }
    const signed = readChallengeToken(challenge, await challengeSecret())
    if (!signed || signed.accountId !== account.id) {
      return fail('That challenge expired — start again', 401)
    }
    let step: number | null = null
    const viaTotp = account.totpSecret
      ? verifyTotp(account.totpSecret, code, account.totpLastStep)
      : null
    if (viaTotp?.ok) {
      step = viaTotp.step
    } else {
      const idx = matchBackupCode(code, account.backupCodes)
      if (idx >= 0) {
        const arr = safeCodes(account.backupCodes)
        arr.splice(idx, 1)
        await db.account.update({ where: { id: account.id }, data: { backupCodes: JSON.stringify(arr) } })
      } else {
        return fail('That code is not right', 401)
      }
    }
    if (step !== null) {
      // single-use watermark — a code can never be replayed
      await db.account.update({ where: { id: account.id }, data: { totpLastStep: step } })
    }
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

function safeCodes(json: string): string[] {
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
