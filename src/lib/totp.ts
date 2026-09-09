// OpenEir — TOTP second factor (RFC 6238) implemented directly on Node crypto
// so every line is auditable. Parameters follow the standard the authenticator
// apps expect: HMAC-SHA1, 30-second timestep, 6 digits. Verification accepts the
// neighbouring window (±1 step) to tolerate clock drift, and callers enforce
// single-use codes via the account's totpLastStep watermark (replay guard).
//
// Secrets are base32 (RFC 4648, no padding) — the exact alphabet Google
// Authenticator, Aegis and friends parse from otpauth:// URIs.

import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export const TOTP_STEP_SECONDS = 30
export const TOTP_DIGITS = 6
export const TOTP_WINDOW = 1 // ±1 step of clock drift tolerance
export const CHALLENGE_TTL_MS = 120_000 // two minutes to finish the second step

// ---------- base32 ----------

export function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '')
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char)
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

// ---------- code generation ----------

function hotp(secret: Buffer, counter: number): string {
  const msg = Buffer.alloc(8)
  msg.writeUInt32BE(Math.floor(counter / 0x1_0000_0000), 0)
  msg.writeUInt32BE(counter % 0x1_0000_0000, 4)
  const digest = createHmac('sha1', secret).update(msg).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)
  return (code % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, '0')
}

/** The code currently valid for `timeMs` (defaults to now). */
export function totpAt(secretBase32: string, timeMs: number = Date.now()): string {
  return hotp(base32Decode(secretBase32), Math.floor(timeMs / 1000 / TOTP_STEP_SECONDS))
}

export function currentStep(timeMs: number = Date.now()): number {
  return Math.floor(timeMs / 1000 / TOTP_STEP_SECONDS)
}

// ---------- verification ----------

/**
 * Verify a user-entered code against the secret, tolerating ±TOTP_WINDOW steps
 * of drift. Returns the consumed timestep on success (callers persist it as the
 * single-use watermark) or null on failure.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  lastUsedStep: number | null,
  timeMs: number = Date.now(),
): { ok: true; step: number } | { ok: false } {
  const secret = base32Decode(secretBase32)
  if (secret.length < 10) return { ok: false } // ≥ 80 bits required
  const digits = (code ?? '').replace(/\D/g, '')
  if (digits.length !== TOTP_DIGITS) return { ok: false }
  const nowStep = currentStep(timeMs)
  for (let drift = -TOTP_WINDOW; drift <= TOTP_WINDOW; drift++) {
    const step = nowStep + drift
    if (step <= 0) continue
    if (lastUsedStep !== null && step <= lastUsedStep) continue // replay guard
    const expected = hotp(secret, step)
    const a = Buffer.from(expected)
    const b = Buffer.from(digits)
    if (a.length === b.length && timingSafeEqual(a, b)) return { ok: true, step }
  }
  return { ok: false }
}

// ---------- enrollment ----------

/** 160-bit secret → 32 base32 chars, the sweet spot every authenticator accepts. */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

/**
 * otpauth URI. `issuer` appears in the authenticator list; the account label is
 * usually the login name so multi-instance users can tell entries apart.
 */
export function otpauthUri(secret: string, accountLabel: string, issuer = 'OpenEir'): string {
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  })
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountLabel)}?${params}`
}

// ---------- backup codes ----------

const BACKUP_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789' // unambiguous set

/** Ten one-time codes like "k7m2-qf4x" — returned once, stored as sha256 hashes. */
export function newBackupCodes(count = 10): string[] {
  const codes: string[] = []
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(8)
    let raw = ''
    for (const byte of bytes) raw += BACKUP_ALPHABET[byte % BACKUP_ALPHABET.length]
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`)
  }
  return codes
}

export function hashBackupCode(code: string): string {
  // sha256 via auth.ts's helper is over HTTP bodies only — keep this local to
  // avoid a circular import; the code space is tiny so plain sha256 suffices.
  return createHmac('sha256', 'openeir-backup-code').update(code.trim().toLowerCase()).digest('hex')
}

/** Match a user-entered code against the stored hashes; returns match index or -1. */
export function matchBackupCode(code: string, hashesJson: string): number {
  const hashes = safeParse(hashesJson)
  if (!hashes.length) return -1
  const candidate = hashBackupCode(code)
  for (let i = 0; i < hashes.length; i++) {
    if (hashes[i] === candidate) return i
  }
  return -1
}

function safeParse(json: string): string[] {
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

// ---------- login challenges (stateless, HMAC-signed) ----------

/**
 * After the password step we hand the client a short-lived signed challenge;
 * the code step exchanges challenge+code for a session. The signing key lives
 * in AppSetting (generated lazily, like the VAPID keys) so challenges survive
 * server restarts without ever touching a session row.
 */
export async function challengeSecret(): Promise<string> {
  const { db } = await import('@/lib/db')
  const KEY = 'auth.challengeSecret'
  const row = await db.appSetting.findUnique({ where: { key: KEY } })
  if (row?.value) return row.value
  const value = randomBytes(32).toString('base64url')
  await db.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value },
    update: { value },
  })
  return value
}

export function signChallenge(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function makeChallengeToken(accountId: string, secret: string, timeMs: number = Date.now()): string {
  const payload = `${accountId}.${timeMs + CHALLENGE_TTL_MS}.${randomBytes(8).toString('base64url')}`
  return `${Buffer.from(payload).toString('base64url')}.${signChallenge(payload, secret)}`
}

export function readChallengeToken(
  token: string,
  secret: string,
  timeMs: number = Date.now(),
): { accountId: string } | null {
  const [payloadB64, sig] = (token ?? '').split('.')
  if (!payloadB64 || !sig) return null
  let payload: string
  try {
    payload = Buffer.from(payloadB64, 'base64url').toString()
  } catch {
    return null
  }
  const expected = signChallenge(payload, secret)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  const [accountId, expStr] = payload.split('.')
  const exp = Number(expStr)
  if (!accountId || !Number.isFinite(exp) || exp < timeMs) return null
  return { accountId }
}
