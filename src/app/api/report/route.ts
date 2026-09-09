// OpenEir — report/export endpoints
// GET /api/report?from&to&sections&format=json|html|pdf
//   json → structured payload for the report builder
//   html → print-ready clinical document (autoprint=1 opens the print dialog)
//   pdf  → clinical PDF (same data, same phrasing — server-rendered via pdf-lib)
import { fail } from '@/lib/api-utils'
import { buildReportData, buildNarrative, buildReportHtml, REPORT_SECTIONS, type ReportSection } from '@/lib/report'
import { buildReportPdf } from '@/lib/report-pdf'
import { emitEvent } from '@/lib/events'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  const url = new URL(req.url)
  const format = (url.searchParams.get('format') ?? 'json').toLowerCase()
  const from = url.searchParams.get('from')
  const sections = (url.searchParams.get('sections') ?? REPORT_SECTIONS.join(','))
    .split(',').filter((s): s is ReportSection => (REPORT_SECTIONS as readonly string[]).includes(s))

  const data = await buildReportData({ from })

  void emitEvent('REPORT_VIEWED', { window: data.window.days, format }, 'low')

  if (format === 'json') {
    return Response.json({
      generatedAt: new Date().toISOString(),
      window: data.window,
      patient: data.patient,
      bp: data.bp, glucose: data.glucose, adherence: data.adherence, score: data.score,
      medications: data.medications,
      lifestyle: data.lifestyle,
      notable: data.notable,
    })
  }

  // HTML and PDF both offer the AI narrative — generated best-effort.
  let narrative = ''
  if (sections.includes('narrative')) narrative = await buildNarrative(data)

  if (format === 'pdf') {
    const pdf = await buildReportPdf(data, { sections, narrative })
    const name = `OpenEir-Report-${data.patient.name.replace(/[^\w.-]+/g, '_')}-${data.window.to}.pdf`
    return new Response(pdf as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${name}"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  if (format === 'html') {
    const html = buildReportHtml(data, { sections, narrativeHtml: narrative })
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
  }

  return fail('Unknown format', 400)
}
