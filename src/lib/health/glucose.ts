// OpenEir — glucose domain logic

export type GlucoseContext = 'fasting' | 'pre_meal' | 'post_meal' | 'bedtime' | 'random'
export type GlucoseCategory = 'low' | 'in_range' | 'slightly_high' | 'high' | 'very_high'

export const GLUCOSE_CONTEXTS: { key: GlucoseContext; label: string }[] = [
  { key: 'fasting', label: 'Fasting' },
  { key: 'pre_meal', label: 'Before meal' },
  { key: 'post_meal', label: 'After meal' },
  { key: 'bedtime', label: 'Bedtime' },
  { key: 'random', label: 'Random' },
]

export const MMOL_TO_MGDL = 18.016

export const toMgdl = (mmol: number) => Math.round(mmol * MMOL_TO_MGDL * 10) / 10
export const toMmol = (mgdl: number) => Math.round((mgdl / MMOL_TO_MGDL) * 10) / 10

export interface GlucoseTargets { min: number; max: number } // mmol/L

/**
 * Context-aware categorization (ADA-informed):
 * fasting/pre-meal target < 7.2 mmol/L (130 mg/dL), post-meal < 10 (180 mg/dL).
 * The personal targets from the profile always refine the in-range band.
 */
export function categorizeGlucose(
  valueMmol: number,
  context: GlucoseContext,
  targets: GlucoseTargets,
): GlucoseCategory {
  if (valueMmol < 3.9) return 'low'
  const ceiling = context === 'post_meal' || context === 'random'
    ? Math.max(targets.max + 2.8, 10.0)
    : targets.max
  if (valueMmol <= ceiling && valueMmol >= targets.min) return 'in_range'
  if (valueMmol <= ceiling + 1.7) return 'slightly_high'
  if (valueMmol <= ceiling + 4) return 'high'
  return 'very_high'
}

export const GLUCOSE_CATEGORIES: Record<GlucoseCategory, { label: string; color: string; className: string }> = {
  low: { label: 'Low', color: '#06b6d4', className: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300' },
  in_range: { label: 'In range', color: '#10b981', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  slightly_high: { label: 'Slightly high', color: '#f59e0b', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  high: { label: 'High', color: '#f97316', className: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300' },
  very_high: { label: 'Very high', color: '#ef4444', className: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' },
}

/** Estimated HbA1c from mean glucose (mmol/L) — GMI formula (ADAG study). */
export function estimateHbA1c(meanGlucoseMmol: number): number {
  const mgdl = meanGlucoseMmol * MMOL_TO_MGDL
  return Math.round((3.31 + 0.02392 * mgdl) * 10) / 10
}
