// OpenEir — blood pressure domain logic (ACC/AHA 2017 categories)

export type BpCategory = 'low' | 'normal' | 'elevated' | 'stage1' | 'stage2' | 'crisis'

export interface BpCategoryMeta {
  key: BpCategory
  label: string
  short: string
  color: string // hex for charts
  className: string // tailwind for badges
  advice: string
}

export const BP_CATEGORIES: Record<BpCategory, BpCategoryMeta> = {
  low: {
    key: 'low', label: 'Low', short: 'Low', color: '#06b6d4',
    className: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300',
    advice: 'Below 90/60. Sit down, hydrate, stand up slowly. Mention it to your doctor if you feel dizzy.',
  },
  normal: {
    key: 'normal', label: 'Normal', short: 'Normal', color: '#10b981',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    advice: 'In range. Keep doing what works.',
  },
  elevated: {
    key: 'elevated', label: 'Elevated', short: 'Elevated', color: '#f59e0b',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    advice: 'Systolic 120–129 and diastolic below 80. Focus on lifestyle: sodium, sleep, movement.',
  },
  stage1: {
    key: 'stage1', label: 'Stage 1 Hypertension', short: 'Stage 1', color: '#f97316',
    className: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
    advice: '130–139 / 80–89. Log consistently for a week and discuss with your doctor.',
  },
  stage2: {
    key: 'stage2', label: 'Stage 2 Hypertension', short: 'Stage 2', color: '#ef4444',
    className: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
    advice: '≥140 / ≥90. Re-measure after 5 minutes of rest. Contact your doctor if it stays here.',
  },
  crisis: {
    key: 'crisis', label: 'Hypertensive Crisis', short: 'Crisis', color: '#e11d48',
    className: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
    advice: '≥180 / ≥120. Wait 5 minutes and re-measure. If still high, seek immediate medical care.',
  },
}

/** ACC/AHA 2017 categorization. Diastolic always wins if higher. */
export function categorizeBp(systolic: number, diastolic: number): BpCategory {
  if (systolic >= 180 || diastolic >= 120) return 'crisis'
  if (systolic >= 140 || diastolic >= 90) return 'stage2'
  if (systolic >= 130 || diastolic >= 80) return 'stage1'
  if (systolic >= 120) return 'elevated'
  if (systolic <= 90 || diastolic <= 60) return 'low'
  return 'normal'
}

export function categorizePulse(pulse: number): 'low' | 'normal' | 'high' {
  if (pulse < 60) return 'low'
  if (pulse > 100) return 'high'
  return 'normal'
}

export const BP_LABELS = ['morning', 'evening', 'pre_med', 'post_med', 'general'] as const
export const KNOWN_TAGS = [
  'stress', 'exercise', 'illness', 'poor-sleep', 'high-sodium',
  'alcohol', 'caffeine', 'fasted', 'meds-changed', 'travel',
]
