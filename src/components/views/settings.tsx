'use client'

// OpenEir — Settings, regrouped. A visual category grid opens into focused
// detail panels: Profile & accounts · AI & agents · Health · Alerts &
// briefing · Voice & audio · Appearance & language · Data & backup ·
// Emergency & safety. No more eight-tab wall.

import { useEffect, useState } from 'react'
import {
  User, Target, Bot, Palette, DatabaseBackup, Check, BellRing, Loader2, Activity, CircleAlert,
  ArrowLeft, AudioLines, Siren, HeartPulse, UserCog, ChevronRight,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useProfile, useSaveProfile, useAuth } from '@/lib/api-client'
import { useUI } from '@/lib/store'
import { SETTINGS_SECTIONS } from '@/lib/nav'
import { useI18n, useT } from '@/lib/i18n'
import { PageHeader } from '@/components/page-header'
import { AiProvidersSection } from '@/components/settings/ai-providers'
import { NotificationsSection } from '@/components/settings/notifications'
import { MemorySection } from '@/components/settings/memory'
import { VoicePrefsSection } from '@/components/settings/voice-prefs'
import { AccountsSection } from '@/components/settings/accounts'
import { toast } from 'sonner'
import type { ViewKey } from '@/lib/nav'

const PACK_CHOICES = [
  { code: 'en', label: 'English', ready: true },
  { code: 'de', label: 'Deutsch (German)', ready: false },
  { code: 'zh-CN', label: '简体中文 (Chinese)', ready: false },
  { code: 'ar', label: 'العربية (Arabic, RTL)', ready: false },
]

type SectionKey = 'profile' | 'ai' | 'health' | 'alerts' | 'voice' | 'appearance' | 'data' | 'emergency'

const SECTION_ICONS: Record<SectionKey, typeof User> = {
  profile: UserCog,
  ai: Bot,
  health: HeartPulse,
  alerts: BellRing,
  voice: AudioLines,
  appearance: Palette,
  data: DatabaseBackup,
  emergency: Siren,
}

export function SettingsView() {
  const { t } = useT()
  const auth = useAuth()
  const role = auth.data?.role ?? 'admin'
  const section = useUI((s) => s.settingsSection) as SectionKey | null
  const setSection = (k: SectionKey | null) => useUI.getState().setSettingsSection(k)
  const setView = useUI((s) => s.setView)

  if (section === null) {
    return (
      <div className="space-y-4">
        <PageHeader view="settings" subtitle={t('settings.subtitle')} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SETTINGS_SECTIONS.map(({ key, label, desc, adminOnly }) => {
            if (adminOnly && role !== 'admin') return null
            const I = SECTION_ICONS[key as SectionKey]
            return (
              <button
                key={key}
                onClick={() => setSection(key as SectionKey)}
                className="group flex min-h-[104px] flex-col justify-between rounded-2xl border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40"
                aria-label={t(label)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground" aria-hidden>
                    <I className="h-5 w-5" />
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </div>
                <div>
                  <div className="text-sm font-semibold">{t(label)}</div>
                  <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t(desc)}</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const meta = SETTINGS_SECTIONS.find((s) => s.key === section)!
  const I = SECTION_ICONS[section]
  return (
    <div className="space-y-4">
      <PageHeader
        view="settings"
        icon={I}
        title={t(meta.label)}
        actions={
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setSection(null)}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> {t('settings.back')}
          </Button>
        }
      />

      {section === 'profile' && (<div className="space-y-4"><ProfileIdentityForm /><AccountsSection /></div>)}
      {section === 'ai' && <AiProvidersSection />}
      {section === 'health' && (<div className="space-y-4"><TargetsForm /><MemorySection /></div>)}
      {section === 'alerts' && <NotificationsSection />}
      {section === 'voice' && <VoicePrefsSection />}
      {section === 'appearance' && <AppearanceLanguageSection />}
      {section === 'data' && <DataSection />}
      {section === 'emergency' && <EmergencySection />}
    </div>
  )
}

// ---------------- Profile identity (name, body, autonomy) ----------------
function ProfileIdentityForm() {
  const { t } = useT()
  const profile = useProfile()
  if (!profile.data) return null
  const p = profile.data.profile
  return <ProfileForm p={p} />
}

function ProfileForm({ p }: { p: NonNullable<ReturnType<typeof useProfile>['data']>['profile'] }) {
  const { t } = useT()
  const save = useSaveProfile()
  const [name, setName] = useState(p.fullName)
  const [birthYear, setBirthYear] = useState(p.birthYear?.toString() ?? '')
  const [height, setHeight] = useState(p.heightCm?.toString() ?? '')
  const [conditions, setConditions] = useState(p.conditions.join(', '))
  const [autonomy, setAutonomy] = useState((p.prefs.aiAutonomy as string) ?? 'proactive')

  const saveProfile = () => {
    save.mutate({
      fullName: name,
      birthYear: birthYear ? Number(birthYear) : null,
      heightCm: height ? Number(height) : null,
      conditions: conditions.split(',').map((c) => c.trim()).filter(Boolean),
      bpSystolicTarget: p.bpSystolicTarget, bpDiastolicTarget: p.bpDiastolicTarget,
      glucoseTargetMin: p.glucoseTargetMin, glucoseTargetMax: p.glucoseTargetMax, glucoseUnit: p.glucoseUnit,
      onboarded: true,
      prefs: { ...p.prefs, aiAutonomy: autonomy },
    }, { onSuccess: () => toast.success('Profile saved') })
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="s-name">Name</Label>
            <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5" /></div>
          <div><Label htmlFor="s-year">Birth year</Label>
            <Input id="s-year" type="number" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} className="mt-1.5" placeholder="1968" /></div>
          <div><Label htmlFor="s-height">Height (cm)</Label>
            <Input id="s-height" type="number" value={height} onChange={(e) => setHeight(e.target.value)} className="mt-1.5" /></div>
          <div><Label htmlFor="s-cond">Conditions (comma-separated)</Label>
            <Input id="s-cond" value={conditions} onChange={(e) => setConditions(e.target.value)} className="mt-1.5" placeholder="Hypertension, Type 2 Diabetes" /></div>
        </div>
        <div className="border-t pt-4">
          <Label>AI autonomy</Label>
          <Select value={autonomy} onValueChange={setAutonomy}>
            <SelectTrigger className="mt-1.5 max-w-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="off">Off — rules only, no AI calls</SelectItem>
              <SelectItem value="gentle">Gentle — AI only on readings & questions</SelectItem>
              <SelectItem value="proactive">Proactive — full ambient intelligence</SelectItem>
            </SelectContent>
          </Select>
          <p className="mt-1.5 text-xs text-muted-foreground">Deterministic rule-based insights always run locally. This controls optional AI enrichment on top.</p>
        </div>
        <Button onClick={saveProfile} disabled={save.isPending}>{save.isPending ? t('common.saving') : t('common.save')}</Button>
      </CardContent>
    </Card>
  )
}

// ---------------- Clinical targets (Health category) ----------------
function TargetsForm() {
  const { t } = useT()
  const profile = useProfile()
  const save = useSaveProfile()
  if (!profile.data) return null
  const p = profile.data.profile
  return <Targets p={p} />
}

function Targets({ p }: { p: NonNullable<ReturnType<typeof useProfile>['data']>['profile'] }) {
  const { t } = useT()
  const save = useSaveProfile()
  const [sysT, setSysT] = useState(p.bpSystolicTarget)
  const [diaT, setDiaT] = useState(p.bpDiastolicTarget)
  const [glMin, setGlMin] = useState(p.glucoseTargetMin)
  const [glMax, setGlMax] = useState(p.glucoseTargetMax)
  const [unit, setUnit] = useState<'mmol' | 'mgdl'>(p.glucoseUnit as 'mmol' | 'mgdl')

  const saveTargets = () => {
    save.mutate({
      fullName: p.fullName, birthYear: p.birthYear, heightCm: p.heightCm, conditions: p.conditions,
      bpSystolicTarget: sysT, bpDiastolicTarget: diaT,
      glucoseTargetMin: glMin, glucoseTargetMax: glMax, glucoseUnit: unit,
      onboarded: true, prefs: p.prefs,
    }, { onSuccess: () => toast.success('Targets saved') })
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-2 text-sm font-medium"><Target className="h-4 w-4 text-primary" aria-hidden /> {t('settings.targets')}</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Systolic target: <b>{sysT}</b> mmHg</Label>
            <Slider value={[sysT]} min={110} max={150} step={1} onValueChange={(v) => setSysT(v[0])} className="mt-2" aria-label="Systolic target" />
          </div>
          <div>
            <Label>Diastolic target: <b>{diaT}</b> mmHg</Label>
            <Slider value={[diaT]} min={65} max={100} step={1} onValueChange={(v) => setDiaT(v[0])} className="mt-2" aria-label="Diastolic target" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><Label>Glucose floor</Label>
            <Input type="number" step="0.1" value={glMin} onChange={(e) => setGlMin(Number(e.target.value))} className="mt-1.5" /></div>
          <div><Label>Glucose ceiling</Label>
            <Input type="number" step="0.1" value={glMax} onChange={(e) => setGlMax(Number(e.target.value))} className="mt-1.5" /></div>
          <div><Label>Unit</Label>
            <Select value={unit} onValueChange={(v) => setUnit(v as 'mmol' | 'mgdl')}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mmol">mmol/L</SelectItem>
                <SelectItem value="mgdl">mg/dL</SelectItem>
              </SelectContent>
            </Select></div>
        </div>
        <Button onClick={saveTargets} disabled={save.isPending}>{save.isPending ? t('common.saving') : t('common.save')}</Button>
      </CardContent>
    </Card>
  )
}

// ---------------- Appearance & language ----------------
function AppearanceLanguageSection() {
  const { t } = useT()
  const { simpleMode, largeText, highContrast, setAppearance } = useUI()
  const i18n = useI18n()

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-5 p-5">
          {([
            ['simpleMode', t('settings.simpleMode'), 'Hide advanced panels (correlations, agent tools). Perfect for sharing the app with family.'],
            ['largeText', t('settings.largeText'), 'Bigger type everywhere — great for small screens and tired eyes.'],
            ['highContrast', t('settings.highContrast'), 'Maximum-contrast palette for low vision.'],
          ] as const).map(([key, label, desc]) => (
            <div key={key} className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs text-muted-foreground">{desc}</div>
              </div>
              <Switch
                checked={key === 'simpleMode' ? simpleMode : key === 'largeText' ? largeText : highContrast}
                onCheckedChange={(v) => setAppearance({ [key]: v })}
                aria-label={label}
              />
            </div>
          ))}
          <div className="border-t pt-4">
            <div className="text-sm font-medium">Quiet hours</div>
            <p className="text-xs text-muted-foreground">Eir stays silent between these hours (rules still run; AI narration pauses).</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <p className="text-sm text-muted-foreground">
            OpenEir currently ships in English. Community language packs (German, Simplified Chinese, Arabic/RTL)
            are in active translation and will be enabled in an upcoming release — partial packs are not shipped half-done.
            Want to help finish one? See <a className="text-primary underline" href="https://github.com/openeir/openeir/blob/main/docs/LANGUAGE_PACKS.md" target="_blank" rel="noopener">docs/LANGUAGE_PACKS.md</a>.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {PACK_CHOICES.map((p) => (
              <button
                key={p.code}
                onClick={async () => {
                  if (!p.ready) { toast.info(`${p.label} — coming soon`, { description: 'This language pack is still being translated.' }); return }
                  await i18n.setLanguage(p.code)
                  toast.success(`Language: ${p.label}`)
                }}
                disabled={!p.ready && i18n.lang !== p.code}
                className={`flex min-h-[48px] items-center justify-between gap-2 rounded-xl border px-4 text-sm font-medium transition-colors ${
                  i18n.lang === p.code ? 'border-primary bg-primary/5 text-primary'
                    : p.ready ? 'hover:bg-accent' : 'cursor-not-allowed text-muted-foreground/60'}`}
                aria-pressed={i18n.lang === p.code}
              >
                <span>{p.label}</span>
                {i18n.lang === p.code ? <Check className="h-4 w-4 shrink-0" aria-hidden />
                  : !p.ready ? <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">Coming soon</Badge>
                  : null}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------- Data & backup ----------------
function DataSection() {
  return (
    <div className="space-y-4">
      <SystemCheckCard />
      <Card>
        <CardContent className="space-y-4 p-5">
          <p className="text-sm text-muted-foreground">
            Your data lives in a single SQLite file on your machine. Automatic snapshots run every 6 hours
            (last 30 kept) — plus the manual backup here. No cloud, no accounts.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href="/api/export?format=json" download><Button variant="outline" className="gap-2"><DatabaseBackup className="h-4 w-4" aria-hidden />Download full backup (JSON)</Button></a>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
            <b>Self-hosting tips:</b> mount <code>/app/db</code> as a Docker volume, snapshot it with your existing backup
            job (it is safe to copy while the app is running — SQLite in WAL mode), and restore by replacing the file.
            API keys are encrypted at rest with an instance key stored beside the database.
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------- System Check (plain-language status) ----------------
interface CheckRow { id: string; label: string; ok: boolean; detail: string }
interface SystemCheckData { ok: boolean; summary: string; checks: CheckRow[]; checkedAt: string }

function SystemCheckCard() {
  const [data, setData] = useState<SystemCheckData | null>(null)
  const [busy, setBusy] = useState<'check' | 'backup' | null>(null)
  const [backupMsg, setBackupMsg] = useState<string | null>(null)

  const run = async () => {
    setBusy('check')
    try {
      const r = await fetch('/api/system-check', { signal: AbortSignal.timeout(90_000) })
      if (r.ok) setData(await r.json())
    } catch { /* keep previous state visible */ }
    setBusy(null)
  }
  useEffect(() => { void run() }, [])

  const backupNow = async () => {
    setBusy('backup')
    try {
      const r = await fetch('/api/system-check', { method: 'POST' })
      const d = await r.json() as { ok: boolean; error?: string }
      setBackupMsg(d.ok ? 'Snapshot saved ✓' : `Backup failed: ${d.error ?? 'unknown'}`)
    } catch { setBackupMsg('Backup failed — is the server running?') }
    setBusy(null)
    void run()
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">System check</p>
            <p className="text-xs text-muted-foreground">what Eir needs to work — in plain words</p>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void run()} disabled={busy !== null}>
            {busy === 'check' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Activity className="h-3.5 w-3.5" aria-hidden />}
            Check again
          </Button>
        </div>

        {!data && <p className="text-sm text-muted-foreground">Running the first check…</p>}
        {data && (
          <>
            <p className={`text-sm font-medium ${data.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
              {data.summary}
            </p>
            <div className="space-y-1.5">
              {data.checks.map((c) => (
                <div key={c.id} className="flex items-start gap-2.5 rounded-lg border border-border/60 px-3 py-2">
                  {c.ok
                    ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                    : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">{c.label}</p>
                    <p className="text-xs text-muted-foreground">{c.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="flex items-center gap-2 border-t border-border/60 pt-3">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void backupNow()} disabled={busy !== null}>
            {busy === 'backup' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <DatabaseBackup className="h-3.5 w-3.5" aria-hidden />}
            Back up now
          </Button>
          {backupMsg && <span className="text-xs text-muted-foreground">{backupMsg}</span>}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------- Emergency & safety (deep link) ----------------
function EmergencySection() {
  const { t } = useT()
  const setView = useUI((s) => s.setView)
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground" aria-hidden>
            <Siren className="h-5 w-5" />
          </span>
          <div>
            <div className="text-sm font-semibold">{t('nav.safety')}</div>
            <p className="mt-0.5 max-w-md text-xs leading-relaxed text-muted-foreground">
              Emergency contacts, the SOS flow, trusted companions and check-in reminders all live on the Safety page — one place, one tap away.
            </p>
          </div>
        </div>
        <Button onClick={() => setView('safety')} className="gap-2">
          <Siren className="h-4 w-4" aria-hidden /> {t('nav.safety')}
        </Button>
      </CardContent>
    </Card>
  )
}
