// OpenEir — "Send report to GP". Builds the clinical report (shared assembly
// with GET /api/report), renders the PDF attachment and emails it through the
// operator's own SMTP server. Recipient defaults to the GP practice email on
// the profile. Rate-limited hard — this endpoint can send real mail.
import { db } from '@/lib/db'
import { ok, fail, parseBody, rateLimit, clientKey } from '@/lib/api-utils'
import { getSession } from '@/lib/auth'
import { buildReportData, buildNarrative, buildReportHtml, buildReportText, REPORT_SECTIONS, type ReportSection } from '@/lib/report'
import { buildReportPdf } from '@/lib/report-pdf'
import { loadReadyTransport, sendMail } from '@/lib/smtp'
import { emitEvent } from '@/lib/events'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const bodySchema = z.object({
  to: z.string().email().max(200).optional(),
  windowDays: z.coerce.number().int().min(7).max(365).optional(),
  message: z.string().max(2000).optional(),
  sections: z.string().max(200).optional(),
})

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return fail('Sign in required', 401)
  if (session.role === 'viewer') return fail('Viewers cannot send reports', 403)
  if (!rateLimit(clientKey(req, 'report-email'), 5, 3600_000)) {
    return fail('Email limit reached — try again later', 429)
  }
  const parsed = await parseBody(req, bodySchema)
  if ('response' in parsed) return parsed.response
  const { to, windowDays, message, sections: sectionsCsv } = parsed.data

  const profile = await db.profile.findFirst()
  if (!profile) return fail('Complete setup first', 400)
  const recipient = (to || profile.gpEmail || '').trim()
  if (!recipient) return fail('No recipient — add the GP email on the profile or pass "to"', 422)

  const ready = await loadReadyTransport()
  if ('error' in ready) return fail(ready.error, 400)

  const sections = (sectionsCsv ?? REPORT_SECTIONS.join(','))
    .split(',').filter((s): s is ReportSection => (REPORT_SECTIONS as readonly string[]).includes(s))

  const data = await buildReportData({ windowDays })
  const narrative = sections.includes('narrative') ? await buildNarrative(data) : ''
  const html = buildReportHtml(data, { sections, narrativeHtml: narrative })
  const pdf = await buildReportPdf(data, { sections, narrative })

  const intro = message?.trim()
    ? `<div style="border-left:3px solid #0f766e;padding:8px 14px;margin-bottom:14px;font-size:10.5pt"><p style="margin:0">${message
        .trim()
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>')}</p></div>`
    : ''

  const emailHtml = `<!doctype html><html><body style="font-family:-apple-system,'Segoe UI',Roboto,sans-serif;color:#111;max-width:720px">
<p>Dear ${profile.gpName ? escapeHtml(profile.gpName) : 'Doctor'},</p>
<p> Please find attached the home-monitoring report for <b>${escapeHtml(data.patient.name)}</b>
 covering ${data.window.from} to ${data.window.to} (${data.window.days} days), generated with their consent by OpenEir,
 a self-hosted personal health tracker.</p>
${intro}
<p style="font-size:9pt;color:#555">The attached PDF contains: average blood pressure and time-in-target, medication list with
adherence, glucose statistics${data.hasGlucose ? '' : ' (no glucose data in this window)'}, and suggested questions for the next visit.
Home readings are not a substitute for clinical measurement.</p>
<p style="font-size:9pt;color:#888">This message was sent by the patient's own OpenEir instance — reply goes to the sender address.</p>
</body></html>`

  const fileName = `OpenEir-Report-${data.patient.name.replace(/[^\w.-]+/g, '_')}-${data.window.to}.pdf`
  const result = await sendMail(ready.cfg, ready.password, {
    to: recipient,
    subject: `Home monitoring report — ${data.patient.name} (${data.window.from} to ${data.window.to})`,
    html: emailHtml,
    text: buildReportText(data) + (intro ? `\n\nPersonal note:\n${message!.trim()}` : ''),
    attachments: [{ filename: fileName, content: Buffer.from(pdf), contentType: 'application/pdf' }],
    replyTo: ready.cfg.user || undefined,
  })

  if (!result.ok) return fail(result.error ?? 'Send failed', 502)

  void emitEvent('REPORT_EMAILED', { to: recipient, windowDays: data.window.days }, 'normal')
  return ok({ sent: true, to: recipient, window: data.window, attachment: fileName })
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
