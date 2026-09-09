// OpenEir — typed API client + TanStack Query hooks (client side)
'use client'

import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from '@tanstack/react-query'
import { enqueue, queueLength } from '@/lib/offline'
import { useUI } from '@/lib/store'
import { toast } from 'sonner'

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const body = await res.json()
      if (body?.error) msg = body.error
      if (body?.issues?.length) msg = body.issues.map((i: { path: string; message: string }) => `${i.path}: ${i.message}`).join('; ')
    } catch { /* not json */ }
    throw new Error(msg)
  }
  return res.json() as Promise<T>
}

// ---------- types ----------
export interface Profile {
  id: string; fullName: string; birthYear: number | null; sex: string | null
  heightCm: number | null; conditions: string[]; notes: string | null
  bpSystolicTarget: number; bpDiastolicTarget: number
  glucoseTargetMin: number; glucoseTargetMax: number; glucoseUnit: string
  weightTargetKg: number | null; onboarded: boolean
  gpName: string | null; gpOrg: string | null; gpAddress: string | null
  gpEmail: string | null
  gpPhone: string | null; gpWebsite: string | null; gpPlaceId: string | null
  gpPlusCode: string | null; gpNotes: string | null
  prefs: Record<string, unknown>
}

/** Slim profile shape returned by /api/stats (short target field names). */
export interface StatsProfile {
  id: string; fullName: string
  sysTarget: number; diaTarget: number
  glucoseMin: number; glucoseMax: number; glucoseUnit: string
  weightTargetKg: number | null
  prefs: Record<string, unknown>
  onboarded: boolean
}

export interface BpReadingRow {
  id: string; systolic: number; diastolic: number; pulse: number | null
  arm: string; label: string; tags: string; notes: string | null
  source: string; takenAt: string; createdAt: string
}

export interface GlucoseReadingRow {
  id: string; value: number; context: string; carbs: number | null
  tags: string; notes: string | null; source: string; takenAt: string
}

export interface MedicationRow {
  id: string; name: string; doseValue: number; doseUnit: string; form: string
  purpose: string | null; scheduleTimes: string[]; instructions: string | null
  stock: number | null; refillThreshold: number | null; active: boolean; notes: string | null
  refill: { daysLeft: number | null; refillBy: string | null; urgent: boolean }
}

export interface StatsResponse {
  profile: StatsProfile
  today: string
  lastReading: { systolic: number; diastolic: number; pulse: number | null; takenAt: string; label: string } | null
  bp30: { count: number; avgSys: number; avgDia: number; avgPulse: number; inTargetPct: number; distribution: Record<string, number>; sysSlopePerDay: number; morningAvgSys: number; eveningAvgSys: number; stdSys: number; maxSys: number }
  gl30: { count: number; avg: number; timeInRangePct: number; avgFasting: number; avgPostMeal: number; estimatedHbA1c: number; belowPct: number; abovePct: number; std: number }
  adherence: { pct: number; consecutiveTaken: number; missedRecent: { date: string; time: string; med?: string }[] }
  score: { total: number; grade: string; gradeLabel: string; components: { key: string; label: string; weight: number; value: number; detail: string }[]; spark: string }
  warnings: { type: string; severity: string; confidence: number; title: string; body: string }[]
  streakDays: number
  schedule: { medicationId: string; medicationName: string; dose: string; time: string; status: string }[]
  refills: { med: { id: string; name: string }; daysLeft: number | null; refillBy: string | null; urgent: boolean }[]
  interactions: { level: string; note: string; pair: string }[]
  lifestyle14d: { date: string; mood: number | null; energy: number | null; sleepQuality: number | null; stress: number | null; weightKg: number | null; sodiumHigh: boolean | null }[]
  dailyBp: { at: string; sys: number; dia: number; pulse: number | null; label: string }[]
  dailyGlucose: { at: string; value: number; context: string }[]
  medSchedules: { id: string; name: string; times: string[] }[]
}

export interface InsightRow {
  id: string; kind: string; severity: string; title: string; body: string
  dataJson: Record<string, unknown> | null; sourceEvent: string | null
  origin: string; status: string; pinned: boolean; createdAt: string
}

// ---------- auth ----------

export interface AuthMe {
  mode: 'open' | 'accounts'
  role: 'admin' | 'caregiver' | 'viewer' | null
  account: { id: string; username: string; displayName: string; role: string; totpEnabled?: boolean } | null
}

export function useAuth() {
  return useQuery<AuthMe>({
    queryKey: ['auth-me'],
    queryFn: () => j('/api/auth/me'),
    staleTime: 60_000,
  })
}

export interface AccountRow {
  id: string; username: string; displayName: string
  role: string; active: boolean; createdAt: string
}

export function useAccounts(enabled: boolean) {
  return useQuery<{ accounts: AccountRow[]; mode: 'open' | 'accounts' }>({
    queryKey: ['accounts'],
    queryFn: () => j('/api/auth/accounts'),
    enabled,
  })
}

export function useAccountMutations() {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: ['accounts'] })
  const create = useMutation({
    mutationFn: (input: { username: string; password: string; displayName?: string; role: string }) =>
      j('/api/auth/accounts', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => { refresh(); qc.invalidateQueries({ queryKey: ['auth-me'] }) },
  })
  const update = useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Record<string, unknown>) =>
      j(`/api/auth/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: () => { refresh(); qc.invalidateQueries({ queryKey: ['auth-me'] }) },
  })
  const remove = useMutation({
    mutationFn: (id: string) => j(`/api/auth/accounts/${id}`, { method: 'DELETE' }),
    onSuccess: () => { refresh(); qc.invalidateQueries({ queryKey: ['auth-me'] }) },
  })
  return { create, update, remove }
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { current: string; next: string }) =>
      j('/api/auth/password', { method: 'PUT', body: JSON.stringify(input) }),
  })
}

// ---------- two-factor (TOTP) ----------

export function useTotpStatus(enabled: boolean) {
  return useQuery<{ enabled: boolean }>({
    queryKey: ['totp-status'],
    queryFn: () => j('/api/auth/2fa'),
    enabled,
  })
}

export function useTotpMutations() {
  const qc = useQueryClient()
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['totp-status'] })
    qc.invalidateQueries({ queryKey: ['auth-me'] })
  }
  const setup = useMutation({
    mutationFn: () =>
      j<{ secret: string; uri: string; qr: string }>('/api/auth/2fa', {
        method: 'POST',
        body: JSON.stringify({ action: 'setup' }),
      }),
  })
  const enable = useMutation({
    mutationFn: (code: string) =>
      j<{ enabled: boolean; backupCodes: string[] }>('/api/auth/2fa', {
        method: 'POST',
        body: JSON.stringify({ action: 'enable', code }),
      }),
    onSuccess: refresh,
  })
  const disable = useMutation({
    mutationFn: (input: { password: string; code?: string }) =>
      j('/api/auth/2fa', { method: 'POST', body: JSON.stringify({ action: 'disable', ...input }) }),
    onSuccess: refresh,
  })
  return { setup, enable, disable }
}

// ---------- email (SMTP) ----------

export interface SmtpView {
  configured: boolean
  host?: string
  port?: number
  secure?: boolean
  user?: string
  from?: string
  hasPassword?: boolean
}

export function useSmtpConfig(enabled: boolean) {
  return useQuery<SmtpView>({
    queryKey: ['smtp-config'],
    queryFn: () => j('/api/settings/smtp'),
    enabled,
  })
}

export function useSmtpMutations() {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: ['smtp-config'] })
  const save = useMutation({
    mutationFn: (input: { host: string; port: number; secure: boolean; user: string; from: string; password?: string }) =>
      j('/api/settings/smtp', { method: 'PUT', body: JSON.stringify(input) }),
    onSuccess: refresh,
  })
  const test = useMutation({
    mutationFn: (to?: string) =>
      j<{ sent: boolean; to: string }>('/api/settings/smtp', { method: 'POST', body: JSON.stringify({ to: to || undefined }) }),
  })
  const remove = useMutation({
    mutationFn: () => j('/api/settings/smtp', { method: 'DELETE' }),
    onSuccess: refresh,
  })
  return { save, test, remove }
}

// ---------- native push (UnifiedPush / ntfy) ----------

export interface UnifiedTargetRow {
  id: string
  endpoint: string
  appId: string
  label: string
  createdAt: string
  lastSuccessAt: string | null
  lastErrorAt: string | null
  lastError: string | null
}

export function useUnifiedTargets(enabled: boolean) {
  return useQuery<{ targets: UnifiedTargetRow[] }>({
    queryKey: ['unified-targets'],
    queryFn: () => j('/api/push/unified'),
    enabled,
  })
}

export function useUnifiedMutations() {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: ['unified-targets'] })
  const register = useMutation({
    mutationFn: (input: { endpoint: string; label?: string; appId?: string }) =>
      j('/api/push/unified', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: (id: string) => j(`/api/push/unified?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: refresh,
  })
  return { register, remove }
}

// ---------- report → email ----------

export function useSendReportEmail() {
  return useMutation({
    mutationFn: (input: { to?: string; windowDays?: number; message?: string }) =>
      j<{ sent: boolean; to: string; window: { days: number }; attachment: string }>('/api/report/email', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  })
}

// ---------- hooks ----------
export function useStats() {
  return useQuery<StatsResponse>({
    queryKey: ['stats'],
    queryFn: () => j('/api/stats'),
    refetchInterval: 120_000,
  })
}

export function useProfile() {
  return useQuery<{ profile: Profile }>({
    queryKey: ['profile'],
    queryFn: () => j('/api/profile'),
  })
}

export function useInsights(limit = 30) {
  return useQuery<{ insights: InsightRow[] }>({
    queryKey: ['insights', limit],
    queryFn: () => j(`/api/insights?limit=${limit}`),
  })
}

export function useBpReadings(days = 90) {
  return useQuery<{ readings: BpReadingRow[] }>({
    queryKey: ['bp', days],
    queryFn: () => j(`/api/readings/bp?days=${days}`),
  })
}

export function useGlucoseReadings(days = 90) {
  return useQuery<{ readings: GlucoseReadingRow[] }>({
    queryKey: ['glucose', days],
    queryFn: () => j(`/api/readings/glucose?days=${days}`),
  })
}

export function useMedications() {
  return useQuery<{ medications: MedicationRow[]; interactions: { level: string; note: string; pair: string }[] }>({
    queryKey: ['medications'],
    queryFn: () => j('/api/medications'),
  })
}

export function useLifestyle(days = 60) {
  return useQuery<{ logs: { date: string; mood: number | null; energy: number | null; sleepQuality: number | null; stress: number | null; weightKg: number | null; sodiumHigh: boolean | null }[] }>({
    queryKey: ['lifestyle', days],
    queryFn: () => j(`/api/lifestyle?days=${days}`),
  })
}

// ---------- mutations ----------
function useRefresh() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries()
}

export function usePostReading() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (input: { kind: 'bp' | 'glucose'; payload: Record<string, unknown> }) => {
      const offline = !useUI.getState().online
      if (offline || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        const n = enqueue({ kind: input.kind, payload: input.payload })
        return { queued: true, count: n }
      }
      const url = input.kind === 'bp' ? '/api/readings/bp' : '/api/readings/glucose'
      return { queued: false, data: await j(url, { method: 'POST', body: JSON.stringify(input.payload) }) }
    },
    onSuccess: (_d, v) => {
      refresh()
      // duplicate-guard response: caller decides (offers "Log anyway")
      if (!_d.queued && _d.data && typeof _d.data === 'object' && 'duplicate' in _d.data) return
      toast.success(
        'queued' in _d && _d.queued
          ? 'Saved offline — will sync automatically'
          : v.kind === 'bp' ? 'Blood pressure saved — Eir is taking a look' : 'Glucose saved — Eir is taking a look',
      )
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export interface LogMedicationInput {
  medicationId: string
  date: string
  scheduledTime: string
  status: string
  actualTime?: string | null
  note?: string | null
  /** display name used only for the confirmation toast */
  medName?: string
}

const DOSE_TOAST: Record<string, (name: string) => string> = {
  taken: (n) => `${n} taken`,
  delayed: (n) => `${n} logged as late`,
  skipped: (n) => `${n} skipped`,
  missed: (n) => `${n} marked as missed`,
}

export function useLogMedication() {
  const refresh = useRefresh()
  const qc = useQueryClient()
  return useMutation<{ log: unknown; queued?: boolean }, Error, LogMedicationInput, { prev?: StatsResponse }>({
    mutationFn: (input) => {
      const { medName: _mn, ...payload } = input
      if (!useUI.getState().online || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        enqueue({ kind: 'medlog', payload })
        return Promise.resolve({ log: null, queued: true })
      }
      return j('/api/medications/log', { method: 'POST', body: JSON.stringify(payload) })
    },
    // optimistic: flip the dose status in the stats cache instantly so the
    // row switches from action buttons to a status badge without waiting
    // for the full stats refetch
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ['stats'] })
      const prev = qc.getQueryData<StatsResponse>(['stats'])
      if (prev) {
        qc.setQueryData<StatsResponse>(['stats'], {
          ...prev,
          schedule: prev.schedule.map((d) =>
            d.medicationId === input.medicationId && d.time === input.scheduledTime
              ? { ...d, status: input.status }
              : d,
          ),
        })
      }
      return { prev }
    },
    onSuccess: (_d, v) => {
      const name = v.medName ?? 'Dose'
      const msg = DOSE_TOAST[v.status]?.(name) ?? `${name} dose updated`
      toast.success(msg, {
        description: 'queued' in _d && _d.queued
          ? 'Saved offline — will sync automatically'
          : `${v.scheduledTime} dose logged · adherence and inventory updated`,
      })
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['stats'], ctx.prev)
      toast.error(e.message)
    },
    onSettled: () => refresh(),
  })
}

export function useUpdateInsight() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (input: { id: string; status?: string; pinned?: boolean }) =>
      j(`/api/insights/${input.id}`, { method: 'PATCH', body: JSON.stringify({ status: input.status, pinned: input.pinned }) }),
    onSuccess: () => refresh(),
  })
}

export function useAskEir() {
  return useMutation({
    mutationFn: (question: string) => j<{ answer: string; provider: { label: string; latencyMs: number } }>('/api/ai/ask', {
      method: 'POST', body: JSON.stringify({ question }),
    }),
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpsertLifestyle() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        enqueue({ kind: 'lifestyle', payload })
        return Promise.resolve({ queued: true })
      }
      return j('/api/lifestyle', { method: 'POST', body: JSON.stringify(payload) })
    },
    onSuccess: () => { refresh(); toast.success('Lifestyle saved') },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useSaveProfile() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      j<{ profile: Profile }>('/api/profile', { method: 'PUT', body: JSON.stringify(payload) }),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useMedicationMutations() {
  const refresh = useRefresh()
  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => j('/api/medications', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => { refresh(); toast.success('Medication added') },
    onError: (e: Error) => toast.error(e.message),
  })
  const update = useMutation({
    mutationFn: ({ id, ...payload }: Record<string, unknown> & { id: string }) =>
      j(`/api/medications/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message),
  })
  const remove = useMutation({
    mutationFn: (id: string) => j(`/api/medications/${id}`, { method: 'DELETE' }),
    onSuccess: () => { refresh(); toast.success('Medication removed') },
    onError: (e: Error) => toast.error(e.message),
  })
  return { create, update, remove }
}

export function useDeleteReading() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: ({ kind, id }: { kind: 'bp' | 'glucose'; id: string }) =>
      j(`/api/readings/${kind}/${id}`, { method: 'DELETE' }),
    onSuccess: () => { refresh(); toast.success('Deleted') },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useProviders() {
  return useQuery({
    queryKey: ['providers'],
    queryFn: () => j<{ providers: { id: string; label: string; adapter: string; baseUrl: string | null; model: string | null; enabled: boolean; isDefault: boolean; priority: number; privacyMode: boolean; hasKey: boolean; lastStatus: string | null; lastLatencyMs: number | null }[]; usage: { providerLabel: string; purpose: string; latencyMs: number; ok: boolean; createdAt: string }[]; builtin: { configured: boolean; source: string | null; checkedPaths: string[] } }>('/api/ai/providers'),
  })
}

// ---------- briefing / memory / push ----------

export interface BriefingSection {
  icon: 'score' | 'bp' | 'glucose' | 'meds' | 'streak' | 'warning' | 'focus'
  label: string
  text: string
}

export interface BriefingResponse {
  briefing: { headline: string; sections: BriefingSection[]; spoken: string; focusAction: string | null }
  date: string
  deliveredToday: boolean
  config: { enabled: boolean; time: string; push: boolean }
}

export function useBriefing() {
  return useQuery<BriefingResponse>({
    queryKey: ['briefing'],
    queryFn: () => j('/api/briefing'),
  })
}

export function useDeliverBriefing() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      // force:true — manual re-sends are allowed even after the automatic
      // morning delivery (the server enforces idempotency for auto sends).
      const r = await j<{ briefing: BriefingResponse['briefing']; push: { sent: number } | null }>('/api/briefing', { method: 'POST', body: JSON.stringify({ push: true, force: true }) })
      if (!r) throw new Error('Could not deliver the briefing right now')
      return r
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['briefing'] }); toast.success('Briefing delivered — check your notifications') },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useBriefingConfig() {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['briefing-config'],
    queryFn: () => j<{ enabled: boolean; time: string; push: boolean }>('/api/briefing/config'),
  })
  const save = useMutation({
    mutationFn: (config: { enabled: boolean; time: string; push: boolean }) =>
      j('/api/briefing/config', { method: 'PUT', body: JSON.stringify(config) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['briefing-config'] }); qc.invalidateQueries({ queryKey: ['briefing'] }); toast.success('Briefing schedule saved') },
    onError: (e: Error) => toast.error(e.message),
  })
  return { query, save }
}

export interface MemoryRow {
  id: string; tier: string; kind: string; content: string; pinned: boolean
  importance: number; accessCount: number; lastAccessedAt: string | null
  expiresAt: string | null; createdAt: string
}

export function useMemories() {
  return useQuery({
    queryKey: ['memory'],
    queryFn: () => j<{
      memories: MemoryRow[]
      counts: { core: number; semantic: number; episodic: number }
      lastReflection: string | null
      config: { autoReflect: boolean }
    }>('/api/memory'),
  })
}

export function useMemoryMutations() {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: ['memory'] })
  const add = useMutation({
    mutationFn: (input: { content: string; kind?: string; pinned?: boolean }) =>
      j('/api/memory', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => { refresh(); toast.success('Remembered') },
    onError: (e: Error) => toast.error(e.message),
  })
  const togglePin = useMutation({
    mutationFn: (input: { id: string; pinned: boolean }) =>
      j('/api/memory', { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message),
  })
  const remove = useMutation({
    mutationFn: (id: string) => j(`/api/memory?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => { refresh(); toast.success('Forgotten') },
    onError: (e: Error) => toast.error(e.message),
  })
  const setAutoReflect = useMutation({
    mutationFn: (autoReflect: boolean) =>
      j('/api/memory', { method: 'PATCH', body: JSON.stringify({ autoReflect }) }),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message),
  })
  const reflect = useMutation({
    mutationFn: (force: boolean) =>
      j<{ created: boolean; content: string; aiNarrated: boolean; observation: string | null }>(`/api/memory/reflect${force ? '?force=1' : ''}`, { method: 'POST' }),
    onSuccess: () => { refresh(); toast.success('Reflection written') },
    onError: (e: Error) => toast.error(e.message),
  })
  return { add, togglePin, remove, setAutoReflect, reflect }
}

export function usePushDevices() {
  return useQuery({
    queryKey: ['push'],
    queryFn: () => j<{ publicKey: string; count: number; devices: { id: string; label: string; createdAt: string; lastSuccessAt: string | null; lastErrorAt: string | null; lastError: string | null }[] }>('/api/push'),
  })
}

export { queueLength }
