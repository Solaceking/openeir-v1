// OpenEir — unified input pipeline: duplicate detection.
// Machine-assisted captures (voice, ocr) MUST NOT silently double-log what
// another source (bluetooth, manual) already recorded moments earlier.
// Manual and bluetooth entries are never blocked — only flagged paths are.

export type DedupeSource = 'manual' | 'bluetooth' | 'import' | 'voice' | 'ocr'

/** Sources that pass through dedupe enforcement. */
export const ENFORCED_SOURCES: ReadonlySet<string> = new Set(['voice', 'ocr'])

const WINDOW_MS = 3 * 60 * 1000 // ±3 minutes

interface DuplicateCheck<T> {
  findExisting: () => Promise<T | null>
  isSame: (existing: T) => boolean
}

export interface DuplicateOutcome<T> {
  duplicate: boolean
  existing: T | null
}

/**
 * Look for a near-identical reading within the ±3 min window.
 * Returns the existing row when found; the route decides the response shape.
 */
export async function detectDuplicate<T extends { takenAt: Date }>(
  source: string,
  check: DuplicateCheck<T>,
): Promise<DuplicateOutcome<T>> {
  if (!ENFORCED_SOURCES.has(source)) return { duplicate: false, existing: null }
  const existing = await check.findExisting()
  if (existing && check.isSame(existing)) return { duplicate: true, existing }
  return { duplicate: false, existing: null }
}

export function withinCaptureWindow(takenAt: Date, now = new Date()): boolean {
  return Math.abs(now.getTime() - takenAt.getTime()) <= WINDOW_MS
}
