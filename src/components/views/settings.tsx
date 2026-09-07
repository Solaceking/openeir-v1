'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  User, Target, Bot, Palette, Languages, DatabaseBackup, Plug, Copy, Check,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useProfile, useSaveProfile } from '@/lib/api-client'
import { useUI } from '@/lib/store'
import { useI18n, useT } from '@/lib/i18n'
import { AiProvidersSection } from '@/components/settings/ai-providers'
import { toast } from 'sonner'

const PACK_CHOICES = [
  { code: 'en', label: 'English', ready: true },
  { code: 'de', label: 'Deutsch (German)', ready: false },
  { code: 'zh-CN', label: '简体中文 (Chinese)', ready: false },
  { code: 'ar', label: 'العربية (Arabic, RTL)', ready: false },
]

export function SettingsView() {
  const { t } = useT()
  const profile = useProfile()
  const { simpleMode, largeText, highContrast, setAppearance } = useUI()
  const i18n = useI18n()

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">{t('settings.title')}</h1>

      <Tabs defaultValue="profile">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="profile" className="gap-1.5"><User className="h-4 w-4" aria-hidden />{t('settings.profile')}</TabsTrigger>
          <TabsTrigger value="ai" className="gap-1.5"><Bot className="h-4 w-4" aria-hidden />{t('settings.ai')}</TabsTrigger>
          <TabsTrigger value="appearance" className="gap-1.5"><Palette className="h-4 w-4" aria-hidden />{t('settings.appearance')}</TabsTrigger>
          <TabsTrigger value="language" className="gap-1.5"><Languages className="h-4 w-4" aria-hidden />{t('settings.language')}</TabsTrigger>
          <TabsTrigger value="agent" className="gap-1.5"><Plug className="h-4 w-4" aria-hidden />{t('settings.agent')}</TabsTrigger>
          <TabsTrigger value="data" className="gap-1.5"><DatabaseBackup className="h-4 w-4" aria-hidden />{t('settings.data')}</TabsTrigger>
        </TabsList>

        {/* ------------ Profile ------------ */}
        <TabsContent value="profile">
          {profile.data && <ProfileForm p={profile.data.profile} />}
        </TabsContent>

        {/* ------------ AI providers + agent harness ------------ */}
        <TabsContent value="ai">
          <AiProvidersSection />
        </TabsContent>

        {/* ------------ Appearance ------------ */}
        <TabsContent value="appearance">
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
        </TabsContent>

        {/* ------------ Language ------------ */}
        <TabsContent value="language">
          <Card>
            <CardContent className="space-y-3 p-5">
              <p className="text-sm text-muted-foreground">
                OpenEir currently ships in English. Community language packs (German, Simplified Chinese, Arabic/RTL)
                are in active translation and will be enabled in an upcoming release — partial packs are not shipped half-done.
                Want to help finish one? See <a className="text-teal-700 underline dark:text-teal-400" href="https://github.com/openeir/openeir/blob/main/docs/LANGUAGE_PACKS.md" target="_blank" rel="noopener">docs/LANGUAGE_PACKS.md</a>.
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
        </TabsContent>

        {/* ------------ Agent harness ------------ */}
        <TabsContent value="agent">
          <Card>
            <CardContent className="space-y-4 p-5">
              <p className="text-sm text-muted-foreground">
                OpenEir exposes an MCP-style agent API on your own network. Autonomous agents (Hermes, OpenClaw, custom
                harnesses) can poll your health digest, run deep analyses on their own schedule, and push findings back
                into the ambient feed. Nothing is exposed to the internet unless you expose it.
              </p>
              {[
                { name: 'Capability manifest (MCP-style)', path: '/api/agent/manifest', note: 'GET — discover every agent-callable tool' },
                { name: 'Poll events + health digest', path: '/api/agent/poll?context=1', note: 'GET — unprocessed events & full stats' },
                { name: 'Push an insight', path: '/api/agent/insights', note: 'POST — deliver agent findings to the feed' },
              ].map((e) => (
                <div key={e.path} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-xs">{e.path}</div>
                    <div className="text-xs text-muted-foreground">{e.note}</div>
                  </div>
                  <Button variant="outline" size="sm" className="gap-1.5 shrink-0"
                    onClick={() => { void navigator.clipboard.writeText(`${location.origin}${e.path}`); toast.success('Copied') }}>
                    <Copy className="h-3.5 w-3.5" aria-hidden /> Copy
                  </Button>
                </div>
              ))}
              <div className="rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
                Example agent loop: poll <code>agent/poll</code> every 15 min → if events exist, fetch <code>api/stats</code>,
                run your own analysis, then POST the best finding to <code>agent/insights</code> and ack the events. Scheduled
                deep analyses (weekly correlation hunts, report pre-flight checks) fit the same pattern.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------ Data ------------ */}
        <TabsContent value="data">
          <Card>
            <CardContent className="space-y-4 p-5">
              <p className="text-sm text-muted-foreground">
                Your data lives in a single SQLite file inside the container volume. Back it up like any file — no cloud, no accounts.
              </p>
              <div className="flex flex-wrap gap-2">
                <a href="/api/export?format=json" download><Button variant="outline" className="gap-2"><DatabaseBackup className="h-4 w-4" aria-hidden />Download full backup (JSON)</Button></a>
                <a href="/api/health"><Button variant="outline">System status</Button></a>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
                <b>Self-hosting tips:</b> mount <code>/app/db</code> as a Docker volume, snapshot it with your existing backup
                job (it is safe to copy while the app is running — SQLite in WAL mode), and restore by replacing the file.
                API keys are encrypted at rest with an instance key stored beside the database.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ---------------- Profile form (mounted only when profile is loaded) ----------------
function ProfileForm({ p }: { p: NonNullable<ReturnType<typeof useProfile>['data']>['profile'] }) {
  const { t } = useT()
  const save = useSaveProfile()
  const [name, setName] = useState(p.fullName)
  const [birthYear, setBirthYear] = useState(p.birthYear?.toString() ?? '')
  const [height, setHeight] = useState(p.heightCm?.toString() ?? '')
  const [conditions, setConditions] = useState(p.conditions.join(', '))
  const [sysT, setSysT] = useState(p.bpSystolicTarget)
  const [diaT, setDiaT] = useState(p.bpDiastolicTarget)
  const [glMin, setGlMin] = useState(p.glucoseTargetMin)
  const [glMax, setGlMax] = useState(p.glucoseTargetMax)
  const [unit, setUnit] = useState<'mmol' | 'mgdl'>(p.glucoseUnit as 'mmol' | 'mgdl')
  const [autonomy, setAutonomy] = useState((p.prefs.aiAutonomy as string) ?? 'proactive')

  const saveProfile = () => {
    save.mutate({
      fullName: name,
      birthYear: birthYear ? Number(birthYear) : null,
      heightCm: height ? Number(height) : null,
      conditions: conditions.split(',').map((c) => c.trim()).filter(Boolean),
      bpSystolicTarget: sysT, bpDiastolicTarget: diaT,
      glucoseTargetMin: glMin, glucoseTargetMax: glMax, glucoseUnit: unit,
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
          <div className="mb-3 flex items-center gap-2 text-sm font-medium"><Target className="h-4 w-4 text-teal-600" aria-hidden /> Clinical targets</div>
          <div className="space-y-4">
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
          </div>
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
