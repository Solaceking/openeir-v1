// OpenEir — server-side clinical PDF via pdf-lib (pure JS, no browser).
// Rendered for the "Email to GP" attachment and GET /api/report?format=pdf.
// Standard PDF fonts speak WinAnsi, so every string passes through win()
// which maps the typographic characters the HTML report uses and strips
// anything the encoding cannot carry — a name with an unusual character can
// never crash the build.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { categorizeBp, type BpCategory } from '@/lib/health/bp'
import type { ReportData, ReportSection } from '@/lib/report'

const A4: [number, number] = [595.28, 841.89]
const MARGIN = 46
const TEAL = rgb(0.059, 0.463, 0.431) // #0f766e
const INK = rgb(0.07, 0.07, 0.07)
const MUTED = rgb(0.42, 0.42, 0.42)
const LINE = rgb(0.82, 0.82, 0.82)
const ROW_BG = rgb(0.941, 0.992, 0.980) // #f0fdfa

const WIN_MAP: Record<string, string> = {
  '—': '-', '–': '-', '−': '-', '·': '*', '•': '*', '…': '...', '\u2018': "'", '\u2019': "'",
  '\u201C': '"', '\u201D': '"', 'σ': 'SD', '≤': '<=', '≥': '>=', '≈': '~', '×': 'x', '±': '+/-',
  '°': ' deg', 'μ': 'u', 'é': 'e', 'è': 'e', 'ê': 'e', 'à': 'a', 'â': 'a', 'ä': 'ae', 'ö': 'oe',
  'ü': 'ue', 'ß': 'ss', 'ó': 'o', 'ô': 'o', 'í': 'i', 'ñ': 'n', 'ç': 'c', '€': 'EUR',
}

function win(s: string): string {
  let out = ''
  for (const ch of s ?? '') {
    if (WIN_MAP[ch] !== undefined) out += WIN_MAP[ch]
    else if (ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) <= 255) out += ch
    else if (ch === '\n') out += '\n'
    // everything else (CJK, emoji, unlisted symbols) is dropped silently
  }
  return out
}

export async function buildReportPdf(
  data: ReportData,
  opts: { sections: ReportSection[]; narrative?: string },
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique)

  let page = doc.addPage(A4)
  let y = A4[1] - MARGIN
  const W = A4[0] - MARGIN * 2

  const newPage = () => {
    page = doc.addPage(A4)
    y = A4[1] - MARGIN
  }
  const need = (h: number) => {
    if (y - h < MARGIN + 40) newPage()
  }

  const text = (
    s: string, o: { x?: number; size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; maxW?: number } = {},
  ) => {
    const size = o.size ?? 9.5
    const font = o.font ?? regular
    const maxW = o.maxW ?? W
    let str = win(s)
    while (font.widthOfTextAtSize(str, size) > maxW && str.length > 4) {
      str = str.slice(0, -2)
    }
    if (font.widthOfTextAtSize(str, size) > maxW && str.length > 3) str = str.slice(0, str.length - 1) + '…'
    page.drawText(win(str), { x: o.x ?? MARGIN, y, size, font, color: o.color ?? INK })
    return size * 1.35
  }

  const sectionTitle = (label: string) => {
    need(46)
    y -= 16
    text(label.toUpperCase(), { size: 10, font: bold, color: TEAL })
    y -= 5
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + W, y }, thickness: 0.7, color: LINE })
    y -= 14
  }

  // ---------- header ----------
  page.drawRectangle({ x: MARGIN, y: y - 46, width: W, height: 3, color: TEAL })
  y -= 14
  text('Home Monitoring Report', { size: 17, font: bold, color: TEAL })
  y -= 16
  const who = `${data.patient.name}${data.patient.age ? `, ${data.patient.age}y` : ''}${data.patient.conditions.length ? ` - ${data.patient.conditions.join(', ')}` : ''}`
  text(who, { size: 9, color: MUTED })
  text(`Window: ${data.window.from} to ${data.window.to} (${data.window.days} days)  |  Generated ${new Date().toLocaleDateString()}  |  OpenEir (self-hosted)`, { size: 7.5, color: MUTED })
  y -= 6
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + W, y }, thickness: 0.7, color: LINE })
  y -= 10

  const S = new Set(opts.sections)

  // ---------- overview ----------
  if (S.has('summary')) {
    sectionTitle('Overview')
    const cols = 3
    const colW = W / cols
    const { bp, glucose: gl, score } = data
    const boxes: [string, string][] = [
      [`Avg BP (n=${bp.count})`, `${bp.avgSys}/${bp.avgDia} mmHg`],
      ['In target', `${bp.inTargetPct}% (${data.patient.targets.bp})`],
      ['Eir Score', `${score.total}/100`],
      ['Morning / evening', `${bp.morningAvgSys} / ${bp.eveningAvgSys} mmHg`],
      ['Trend', `${bp.sysSlopePerDay >= 0 ? '+' : ''}${bp.sysSlopePerDay} mmHg/day`],
      ['Pulse avg', `${bp.avgPulse} bpm`],
    ]
    if (data.hasGlucose) {
      boxes.push(
        ['Glucose in range', `${gl.timeInRangePct}%`],
        ['Est. HbA1c', `${gl.estimatedHbA1c}%`],
        ['Glucose mean', `${gl.avg} mmol/L`],
      )
    }
    boxes.forEach(() => void 0) // (rows are laid out below, col-major per row)
    for (let i = 0; i < boxes.length; i += cols) {
      if (y - 30 < MARGIN + 40) newPage()
      const rowY = y
      for (let c = 0; c < cols && i + c < boxes.length; c++) {
        const [k, v] = boxes[i + c]
        const x = MARGIN + c * colW
        page.drawText(win(k), { x, y: rowY, size: 7.5, font: regular, color: MUTED })
        page.drawText(win(v), { x, y: rowY - 11, size: 10.5, font: bold, color: TEAL })
      }
      y -= 28
    }
    y -= 2
  }

  // ---------- AI narrative ----------
  if (S.has('narrative') && opts.narrative) {
    sectionTitle('AI Summary')
    for (const ln of wrapLines(win(opts.narrative), regular, 9.5, W - 16)) {
      if (y - 14 < MARGIN) newPage()
      page.drawText(ln, { x: MARGIN + 8, y, size: 9.5, font: regular, color: INK })
      y -= 13.5
    }
    y -= 6
  }

  // ---------- BP detail ----------
  if (S.has('bp') && data.bpPoints.length) {
    sectionTitle('Blood Pressure Detail')
    text(`Range ${data.bp.minSys}-${data.bp.maxSys} systolic, variability SD ${data.bp.stdSys} mmHg, pulse avg ${data.bp.avgPulse} bpm`, { size: 8.5, color: MUTED })
    y -= 8
    const shown = Math.min(40, data.bpPoints.length)
    drawTable(
      page,
      { x: MARGIN, y, width: W },
      ['When', 'Sys', 'Dia', 'Pulse', 'Label', 'Category'],
      [130, 45, 45, 50, 110, 120],
      data.bpPoints.slice(0, 40).map((r) => [
        new Date(r.takenAt).toLocaleString(), String(r.systolic), String(r.diastolic),
        r.pulse != null ? String(r.pulse) : '-', r.label ?? 'general', catLabel(r.systolic, r.diastolic),
      ]),
      { regular, bold },
    )
    y -= (1 + shown) * 16 + 10 // header row + data rows + breathing room
    if (data.bpPoints.length > 40) {
      text(`...and ${data.bpPoints.length - 40} further readings in the window (see the in-app report).`, { size: 8, color: MUTED })
      y -= 12
    }
  }

  // ---------- meds ----------
  if (S.has('meds') && data.medications.length) {
    sectionTitle('Medications & Adherence')
    const medRows = data.medications.map((m) => [m.name, m.dose, m.times.join(', ') || '-', m.purpose || '-'])
    drawTable(
      page,
      { x: MARGIN, y, width: W },
      ['Medication', 'Dose', 'Schedule', 'Purpose'],
      [150, 90, 130, 230],
      medRows,
      { regular, bold },
    )
    y -= (1 + medRows.length) * 16 + 10
    const a = data.adherence
    text(`Adherence (last ${Math.min(30, data.window.days)} days): ${a.pct}% - ${a.taken} taken, ${a.missed} missed, ${a.delayed} delayed, ${a.skipped} skipped of ${a.total} scheduled doses.`, { size: 8.5 })
    y -= 14
  }

  // ---------- glucose ----------
  if (S.has('glucose') && data.hasGlucose) {
    sectionTitle('Glucose')
    const gl = data.glucose
    text(`Mean ${gl.avg} mmol/L  |  time in range ${gl.timeInRangePct}%  |  below ${gl.belowPct}%  |  above ${gl.abovePct}%  |  SD ${gl.std}  |  n=${gl.count}`, { size: 8.5 })
    y -= 14
  }

  // ---------- questions ----------
  if (S.has('questions')) {
    sectionTitle('Suggested questions for this visit')
    const qs: string[] = [
      `My ${data.window.days}-day average is ${data.bp.avgSys}/${data.bp.avgDia} with ${data.bp.inTargetPct}% of readings at target - is my current treatment where you want it?`,
    ]
    if (data.bp.sysSlopePerDay > 0.2) qs.push(`My readings have been trending up ~${data.bp.sysSlopePerDay} mmHg/day - should we adjust anything?`)
    if (data.adherence.pct < 90) qs.push(`I missed ${data.adherence.missed} doses this period - can we simplify my schedule?`)
    if (data.hasGlucose) qs.push(`My estimated HbA1c is around ${data.glucose.estimatedHbA1c}% - do you want a lab HbA1c to confirm?`)
    qs.push('Which of these home readings would you like me to bring to future visits?')
    for (const q of qs) {
      need(30)
      for (const ln of wrapLines(`- ${win(q)}`, regular, 9, W - 8)) {
        if (y - 13 < MARGIN) newPage()
        page.drawText(ln, { x: MARGIN + 4, y, size: 9, font: regular, color: INK })
        y -= 12.5
      }
      y -= 5
    }
  }

  // ---------- footer on every page ----------
  const pages = doc.getPages()
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: MARGIN, y: MARGIN + 22 }, end: { x: A4[0] - MARGIN, y: MARGIN + 22 }, thickness: 0.5, color: LINE })
    p.drawText(win('Generated by OpenEir - self-hosted, privacy-first health tracking. Home readings are not a substitute for clinical measurement.'), {
      x: MARGIN, y: MARGIN + 10, size: 6.5, font: regular, color: MUTED,
    })
    p.drawText(`${i + 1} / ${pages.length}`, { x: A4[0] - MARGIN - 24, y: MARGIN + 10, size: 6.5, font: regular, color: MUTED })
  })

  return doc.save()
}

function catLabel(sys: number, dia: number): string {
  const map: Record<BpCategory, string> = {
    low: 'Low', normal: 'Normal', elevated: 'Elevated', stage1: 'Stage 1', stage2: 'Stage 2', crisis: 'Crisis',
  }
  return map[categorizeBp(sys, dia)]
}

interface TableOpts {
  regular: PDFFont
  bold: PDFFont
}

/** Fixed-column table with header band and alternating row tint. Returns updated y. */
function drawTable(
  page: PDFPage,
  box: { x: number; y: number; width: number },
  headers: string[],
  widths: number[],
  rows: string[][],
  fonts: TableOpts,
): void {
  const rowH = 16
  let x: number
  let yy = box.y
  const drawRow = (cells: string[], isHeader: boolean) => {
    if (isHeader) {
      page.drawRectangle({ x: box.x, y: yy - rowH + 4, width: box.width, height: rowH, color: ROW_BG })
    }
    x = box.x
    headers.forEach((_, ci) => {
      const w = widths[ci]
      const font = isHeader ? fonts.bold : fonts.regular
      let s = win(cells[ci] ?? '')
      while (font.widthOfTextAtSize(s, 8) > w - 8 && s.length > 3) s = s.slice(0, -2)
      page.drawText(s, { x: x + 4, y: yy - 8, size: 8, font, color: isHeader ? rgb(0.075, 0.306, 0.29) : INK })
      x += w
    })
    yy -= rowH
  }
  drawRow(headers, true)
  for (const r of rows) {
    if (yy - rowH < MARGIN) break // page break: keep v1 simple, table stops cleanly
    drawRow(r, false)
    page.drawLine({ start: { x: box.x, y: yy + 4 }, end: { x: box.x + box.width, y: yy + 4 }, thickness: 0.3, color: LINE })
  }
}

/** Greedy word wrap returning physical lines (also handles very long words). */
function wrapLines(str: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = []
  for (const rawLine of str.split('\n')) {
    let line = ''
    for (const w of rawLine.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${w}` : w
      if (font.widthOfTextAtSize(candidate, size) > width && line) {
        out.push(line)
        line = w
      } else {
        line = candidate
      }
      // hard-split a single word that overflows on its own
      while (font.widthOfTextAtSize(line, size) > width && line.length > 4) {
        let cut = line.length - 1
        while (cut > 4 && font.widthOfTextAtSize(line.slice(0, cut), size) > width) cut--
        out.push(line.slice(0, cut))
        line = line.slice(cut)
      }
    }
    out.push(line)
  }
  return out
}
