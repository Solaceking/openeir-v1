// OpenEir — TOTP second factor management. Session required for everything.
//   GET                     → { enabled }
//   POST { action: setup }  → pending secret + otpauth URI + QR data URL
//   POST { action: enable, code }            → enables factor, returns backup codes ONCE
//   POST { action: disable, password, code } → clears the factor (code = TOTP or backup)
// The factor only flips on after a live code has been verified against the
// pending secret — a broken QR scan can never lock the user out.
import { ok, fail, parseBody } from '@/lib/api-utils'
import { getSession, verifyPassword } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  newTotpSecret, otpauthUri, verifyTotp, newBackupCodes, hashBackupCode, matchBackupCode,
} from '@/lib/totp'
import QRCode from 'qrcode'
import { z } from 'zod'

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('setup') }),
  z.object({ action: z.literal('enable'), code: z.string().min(6).max(20) }),
  z.object({ action: z.literal('disable'), password: z.string().min(1).max(200), code: z.string().max(20).optional() }),
])

export async function GET() {
  const session = await getSession()
  if (!session) return fail('Sign in required', 401)
  const account = await db.account.findUnique({ where: { id: session.accountId } })
  return ok({ enabled: !!account?.totpEnabled })
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return fail('Sign in required', 401)
  const parsed = await parseBody(req, bodySchema)
  if ('response' in parsed) return parsed.response

  const account = await db.account.findUnique({ where: { id: session.accountId } })
  if (!account || !account.active) return fail('Account not found', 404)

  if (parsed.data.action === 'setup') {
    if (account.totpEnabled) return fail('Two-factor is already enabled', 409)
    const secret = newTotpSecret()
    await db.account.update({ where: { id: account.id }, data: { totpPending: secret, totpEnabled: false } })
    const uri = otpauthUri(secret, account.username)
    let qr = ''
    try {
      qr = await QRCode.toDataURL(uri, { margin: 1, width: 256, errorCorrectionLevel: 'M' })
    } catch {
      // caller falls back to showing the raw secret for manual entry
    }
    return ok({ secret, uri, qr })
  }

  if (parsed.data.action === 'enable') {
    if (account.totpEnabled) return fail('Two-factor is already enabled', 409)
    if (!account.totpPending) return fail('Start setup first', 400)
    const check = verifyTotp(account.totpPending, parsed.data.code, account.totpLastStep)
    if (!check.ok) return fail('That code is not right — check the clock on your phone and try again', 401)
    const codes = newBackupCodes()
    await db.account.update({
      where: { id: account.id },
      data: {
        totpSecret: account.totpPending,
        totpPending: null,
        totpEnabled: true,
        totpLastStep: check.step,
        backupCodes: JSON.stringify(codes.map(hashBackupCode)),
      },
    })
    return ok({ enabled: true, backupCodes: codes }) // shown once, never stored in plaintext
  }

  // action === 'disable' — prove password AND possession so a stolen session
  // cannot strip the second factor.
  if (!account.totpEnabled) return ok({ enabled: false })
  if (!verifyPassword(parsed.data.password, account.passwordHash)) {
    return fail('Wrong password', 401)
  }
  let proved = false
  if (account.totpSecret && parsed.data.code) {
    const viaTotp = verifyTotp(account.totpSecret, parsed.data.code, account.totpLastStep)
    if (viaTotp.ok) {
      proved = true
      await db.account.update({ where: { id: account.id }, data: { totpLastStep: viaTotp.step } })
    } else {
      const idx = matchBackupCode(parsed.data.code, account.backupCodes)
      if (idx >= 0) {
        proved = true
        const arr = safeCodes(account.backupCodes)
        arr.splice(idx, 1)
        await db.account.update({ where: { id: account.id }, data: { backupCodes: JSON.stringify(arr) } })
      }
    }
  }
  if (!proved) return fail('Enter a current authenticator code (or a backup code) to turn 2FA off', 401)
  await db.account.update({
    where: { id: account.id },
    data: { totpEnabled: false, totpSecret: null, totpPending: null, totpLastStep: null, backupCodes: '[]' },
  })
  return ok({ enabled: false })
}

function safeCodes(json: string): string[] {
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
