// OpenEir — SMTP settings (admin only). The password is write-only: it is
// encrypted at rest and never returned — GET only reports whether one is set.
//   GET            → masked config + { hasPassword }
//   PUT            → save (password optional = keep existing)
//   POST { to? }   → send a test email
//   DELETE         → remove configuration
import { ok, fail, parseBody } from '@/lib/api-utils'
import { getSession } from '@/lib/auth'
import { getSmtpConfig, saveSmtpConfig, clearSmtpConfig, loadReadyTransport, sendMail } from '@/lib/smtp'
import { maskSecret } from '@/lib/crypto'
import { z } from 'zod'

const putSchema = z.object({
  host: z.string().min(1).max(200),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean().default(false),
  user: z.string().max(200).default(''),
  from: z.string().max(200).default(''),
  password: z.string().max(200).optional(),
})

async function requireAdmin() {
  const session = await getSession()
  if (!session) return { error: fail('Sign in required', 401) }
  if (session.role !== 'admin') return { error: fail('Admin only', 403) }
  return { session }
}

export async function GET() {
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error
  const cfg = await getSmtpConfig()
  if (!cfg) return ok({ configured: false })
  return ok({
    configured: true,
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    user: maskSecret(cfg.user) ?? '',
    from: cfg.from,
    hasPassword: !!cfg.passEnc,
  })
}

export async function PUT(req: Request) {
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error
  const parsed = await parseBody(req, putSchema)
  if ('response' in parsed) return parsed.response
  const { password, ...rest } = parsed.data
  await saveSmtpConfig({ ...rest, password: password || undefined })
  return ok({ saved: true })
}

export async function POST(req: Request) {
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error
  let to = ''
  try {
    const body = (await req.json()) as { to?: string }
    to = (body.to ?? '').trim()
  } catch {
    /* empty body allowed */
  }
  const ready = await loadReadyTransport()
  if ('error' in ready) return fail(ready.error, 400)
  if (!to) to = ready.cfg.user || ready.cfg.from
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return fail('Enter a valid test recipient', 422)
  const result = await sendMail(ready.cfg, ready.password, {
    to,
    subject: 'OpenEir test email',
    text: 'Success — this instance of OpenEir can send email. Reports to your GP will arrive from this address.',
    html: '<p>Success — this instance of <b>OpenEir</b> can send email.</p><p>Reports to your GP will arrive from this address.</p>',
  })
  if (!result.ok) return fail(result.error ?? 'Send failed', 502)
  return ok({ sent: true, to })
}

export async function DELETE() {
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error
  await clearSmtpConfig()
  return ok({ removed: true })
}
