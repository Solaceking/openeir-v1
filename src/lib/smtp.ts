// OpenEir — outbound email over the user's OWN SMTP server. No third-party
// email API, no vendor account: the operator enters their SMTP credentials
// (from their mail provider, ISP or a local relay) in Settings and the
// instance can send the GP report and other mail directly.
// The password is stored AES-256-GCM encrypted (same scheme as AI API keys).
import nodemailer, { type Transporter } from 'nodemailer'
import { db } from '@/lib/db'
import { encryptSecret, decryptSecret } from '@/lib/crypto'

const SETTING_KEY = 'smtp.config'

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean // implicit TLS (465) vs STARTTLS (587)
  user: string
  from: string // envelope From, e.g. "OpenEir <me@example.com>"
  passEnc?: string // encrypted password at rest
}

export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const row = await db.appSetting.findUnique({ where: { key: SETTING_KEY } })
  if (!row) return null
  try {
    const parsed = JSON.parse(row.value) as SmtpConfig
    if (!parsed.host || !parsed.port) return null
    return parsed
  } catch {
    return null
  }
}

export async function saveSmtpConfig(cfg: SmtpConfig & { password?: string }): Promise<void> {
  const stored: SmtpConfig = {
    host: cfg.host.trim(),
    port: cfg.port,
    secure: !!cfg.secure,
    user: cfg.user.trim(),
    from: cfg.from.trim(),
  }
  if (cfg.password) stored.passEnc = encryptSecret(cfg.password)
  await db.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: JSON.stringify(stored) },
    update: { value: JSON.stringify(stored) },
  })
}

export async function clearSmtpConfig(): Promise<void> {
  await db.appSetting.delete({ where: { key: SETTING_KEY } }).catch(() => {})
}

export interface SmtpSendResult {
  ok: boolean
  messageId?: string
  error?: string
}

export async function sendMail(cfg: SmtpConfig, password: string, opts: {
  to: string
  subject: string
  html: string
  text: string
  attachments?: { filename: string; content: Buffer; contentType?: string }[]
  replyTo?: string
}): Promise<SmtpSendResult> {
  let transport: Transporter
  try {
    transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: password } : undefined,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
    })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid SMTP configuration' }
  }
  try {
    const info = await transport.sendMail({
      from: cfg.from || cfg.user,
      to: opts.to,
      replyTo: opts.replyTo,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      attachments: opts.attachments,
    })
    return { ok: true, messageId: info.messageId }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    transport.close()
  }
}

/** Convenience: load config + decrypted password, or a readable error. */
export async function loadReadyTransport(): Promise<{ cfg: SmtpConfig; password: string } | { error: string }> {
  const cfg = await getSmtpConfig()
  if (!cfg) return { error: 'SMTP is not configured yet — add your mail server in Settings → Email' }
  const password = decryptSecret(cfg.passEnc) ?? ''
  if (cfg.user && !password) return { error: 'SMTP password is missing — re-enter it in Settings → Email' }
  return { cfg, password }
}
