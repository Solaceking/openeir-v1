// OpenEir — POST /api/ocr/scan
// Photo of a BP monitor / glucometer / report excerpt -> suggested structured
// fields. NEVER logs anything: the response is a suggestion the Record view
// pre-fills for human confirmation (the save button is the safety gate).
//
// Extraction ladder (graceful degradation):
//   1. Vision model through the provider chain (best on 7-segment LCDs)
//   2. Local tesseract.js + deterministic regex parser (works without any AI)
//   3. { kind: 'unknown' } — user enters manually

import { ok, fail, rateLimit, clientKey } from '@/lib/api-utils'
import { visionScan } from '@/lib/ocr/vision-ocr'
import { parseDeviceText } from '@/lib/ocr/regex-parser'
import { SCAN_CONFIDENCE_THRESHOLD, type ScanResult } from '@/lib/ocr/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])

export async function POST(req: Request) {
  if (!rateLimit(clientKey(req, 'ocr-scan'), 20, 60_000)) return fail('Too many requests', 429)

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return fail('Expected multipart/form-data with an `image` file field', 400)
  }
  const file = form.get('image')
  if (!(file instanceof File)) return fail('Missing `image` file field', 400)
  if (file.size > MAX_BYTES) return fail('Image too large (max 8 MB)', 413)
  const mediaType = (file.type || 'image/jpeg').toLowerCase()
  if (!ALLOWED.has(mediaType)) return fail(`Unsupported image type: ${mediaType}`, 415)

  const buffer = Buffer.from(await file.arrayBuffer())
  const notes: string[] = []

  // 1) Vision model path
  let result: ScanResult
  try {
    result = await visionScan(buffer, mediaType === 'image/heic' || mediaType === 'image/heif' ? 'image/jpeg' : mediaType)
  } catch (err) {
    result = {
      kind: 'unknown', confidence: 0, fields: { kind: 'unknown' }, rawText: '', via: [],
      needsConfirm: true,
      notes: [`Vision scan error: ${err instanceof Error ? err.message.slice(0, 160) : 'unknown'}`],
    }
  }

  // 2) Local OCR fallback (also cross-check when the vision result is weak)
  const needLocal = result.kind === 'unknown'
  if (needLocal) {
    try {
      const { localScan } = await import('@/lib/ocr/local-ocr')
      const local = await localScan(buffer)
      if (local.fields.kind !== 'unknown') {
        const fields = local.fields
        result = {
          kind: fields.kind,
          confidence: 0.65, // local OCR on 7-seg is decent but not great — verify
          fields,
          rawText: local.text.slice(0, 400),
          via: ['local'],
          needsConfirm: true,
          notes: [...notes, 'Read by local OCR (offline) — please verify carefully.'],
        }
      } else {
        notes.push('Local OCR found no plausible reading.')
      }
    } catch (err) {
      notes.push(
        `Local OCR unavailable: ${err instanceof Error ? err.message.slice(0, 120) : 'unknown'} — enter the value manually.`,
      )
    }
  }

  if (result.kind === 'unknown') {
    result.notes = [...result.notes, ...notes]
    return ok(result)
  }
  result.needsConfirm = result.confidence < SCAN_CONFIDENCE_THRESHOLD
  return ok(result)
}
