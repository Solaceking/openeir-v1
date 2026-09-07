// OpenEir — local access control: accounts, scrypt passwords, cookie sessions.
// Household mode ("open", no accounts) keeps the classic zero-friction behavior;
// the moment the first account exists the instance switches to "accounts" mode
// and every page/API (except explicitly public endpoints) requires a session.

import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import type { Role } from '@/lib/nav'

export const SESSION_COOKIE = 'openeir_session'
export const SESSION_DAYS = 30
export type AuthMode = 'open' | 'accounts'

// ---------- passwords (scrypt, salted) ----------

export function hashPassword(pw: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(pw, salt, 64)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  const hash = scryptSync(pw, Buffer.from(saltHex, 'hex'), 64)
  const expect = Buffer.from(hashHex, 'hex')
  return hash.length === expect.length && timingSafeEqual(hash, expect)
}

// ---------- tokens ----------

export function sha256(v: string): string {
  return createHash('sha256').update(v).digest('hex')
}

function newToken(): string {
  return randomBytes(32).toString('base64url')
}

// ---------- auth mode ----------

let modeCache: { mode: AuthMode; at: number } | null = null

export async function getAuthMode(): Promise<AuthMode> {
  if (modeCache && Date.now() - modeCache.at < 5000) return modeCache.mode
  const row = await db.appSetting.findUnique({ where: { key: 'auth_mode' } })
  const mode: AuthMode = row?.value === 'accounts' ? 'accounts' : 'open'
  modeCache = { mode, at: Date.now() }
  return mode
}

export async function setAuthMode(mode: AuthMode): Promise<void> {
  await db.appSetting.upsert({
    where: { key: 'auth_mode' },
    create: { key: 'auth_mode', value: mode },
    update: { value: mode },
  })
  modeCache = { mode, at: Date.now() }
}

/** Recompute mode from the accounts table (used after create/delete). */
export async function refreshAuthMode(): Promise<AuthMode> {
  const count = await db.account.count({ where: { active: true } })
  const mode: AuthMode = count > 0 ? 'accounts' : 'open'
  await setAuthMode(mode)
  return mode
}

// ---------- sessions ----------

export async function createSession(accountId: string, userAgent: string | null): Promise<string> {
  const token = newToken()
  await db.authSession.create({
    data: {
      accountId,
      tokenHash: sha256(token),
      userAgent: userAgent?.slice(0, 180) ?? null,
      expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000),
    },
  })
  return token
}

export interface ServerSession {
  accountId: string
  username: string
  role: Role
  displayName: string
}

/** Core token → session resolution (usable from middleware AND route handlers). */
export async function resolveSession(token: string | undefined | null): Promise<ServerSession | null> {
  if (!token) return null
  const row = await db.authSession.findUnique({
    where: { tokenHash: sha256(token) },
    include: { account: true },
  })
  if (!row || row.expiresAt < new Date() || !row.account.active) return null
  return {
    accountId: row.accountId,
    username: row.account.username,
    role: row.account.role as Role,
    displayName: row.account.displayName || row.account.username,
  }
}

/** Route-handler helper — reads the session from the request cookie jar. */
export async function getSession(): Promise<ServerSession | null> {
  const jar = await cookies()
  return resolveSession(jar.get(SESSION_COOKIE)?.value)
}

export async function destroySession(): Promise<void> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (token) await db.authSession.deleteMany({ where: { tokenHash: sha256(token) } })
}

// Self-hosted instances usually run plain HTTP on the LAN — cookies stay
// non-Secure unless the operator opts in behind TLS.
export const SESSION_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_DAYS * 86400,
  secure: process.env.OPENEIR_SECURE_COOKIE === '1',
}
