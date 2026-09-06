// OpenEir — AES-256-GCM encryption for provider API keys at rest
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const KEY_FILE = join(process.cwd(), 'db', '.appkey')

function getAppKey(): Buffer {
  const envKey = process.env.APP_KEY
  if (envKey) return createHash('sha256').update(envKey).digest()
  if (existsSync(KEY_FILE)) return createHash('sha256').update(readFileSync(KEY_FILE, 'utf8')).digest()
  const raw = randomBytes(32).toString('hex')
  writeFileSync(KEY_FILE, raw, { mode: 0o600 })
  return createHash('sha256').update(raw).digest()
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getAppKey(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.')
}

export function decryptSecret(payload: string | null | undefined): string | null {
  if (!payload) return null
  try {
    const [ivB64, tagB64, dataB64] = payload.split('.')
    const decipher = createDecipheriv('aes-256-gcm', getAppKey(), Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

/** Mask a secret for display: sk-…abcd */
export function maskSecret(plain: string | null): string | null {
  if (!plain) return null
  if (plain.length <= 8) return '••••••••'
  return `${plain.slice(0, 3)}…${plain.slice(-4)}`
}
