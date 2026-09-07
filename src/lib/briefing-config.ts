// OpenEir — Morning Briefing configuration (stored in AppSetting).
import { db } from '@/lib/db'

export interface BriefingConfig {
  enabled: boolean
  time: string // "HH:MM" local
  push: boolean
}

export async function getBriefingConfig(): Promise<BriefingConfig> {
  const row = await db.appSetting.findUnique({ where: { key: 'briefing.config' } })
  const fallback: BriefingConfig = { enabled: true, time: '08:00', push: true }
  if (!row) return fallback
  try {
    return { ...fallback, ...(JSON.parse(row.value) as Partial<BriefingConfig>) }
  } catch {
    return fallback
  }
}

export async function setBriefingConfig(config: BriefingConfig) {
  await db.appSetting.upsert({
    where: { key: 'briefing.config' },
    update: { value: JSON.stringify(config) },
    create: { key: 'briefing.config', value: JSON.stringify(config) },
  })
}
