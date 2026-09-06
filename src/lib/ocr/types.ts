// OpenEir — OCR pipeline types. Scan results are ALWAYS suggestions:
// the UI gates every save behind human confirmation (never auto-log).
import { z } from 'zod'

export const BP_SCAN_FIELDS = z.object({
  kind: z.literal('bp'),
  systolic: z.number().int().min(50).max(300),
  diastolic: z.number().int().min(20).max(200),
  pulse: z.number().int().min(20).max(300).nullable().optional(),
})

export const GLUCOSE_SCAN_FIELDS = z.object({
  kind: z.literal('glucose'),
  value: z.number().min(0.1).max(2000),
  unit: z.enum(['mg/dL', 'mmol/L']).default('mg/dL'),
})

export const UNKNOWN_SCAN_FIELDS = z.object({ kind: z.literal('unknown') })

export const SCAN_FIELDS = z.discriminatedUnion('kind', [
  BP_SCAN_FIELDS,
  GLUCOSE_SCAN_FIELDS,
  UNKNOWN_SCAN_FIELDS,
])

export type BpScanFields = z.infer<typeof BP_SCAN_FIELDS>
export type GlucoseScanFields = z.infer<typeof GLUCOSE_SCAN_FIELDS>
export type ScanFields = z.infer<typeof SCAN_FIELDS>

export interface ScanResult {
  kind: 'bp' | 'glucose' | 'unknown'
  /** 0..1 — agreement between independent extractors raises it; conflicts cap it */
  confidence: number
  fields: ScanFields
  /** text the extractor read (vision transcript or tesseract output) */
  rawText: string
  /** which extractor(s) produced the result */
  via: Array<'vision' | 'local'>
  /** true when confidence is below the auto-fill threshold */
  needsConfirm: boolean
  /** friendly note about what happened (provider fallbacks, low confidence) */
  notes: string[]
}

/** Confidence at/above this level lets the UI pre-fill the form directly. */
export const SCAN_CONFIDENCE_THRESHOLD = 0.75
