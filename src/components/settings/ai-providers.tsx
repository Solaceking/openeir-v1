'use client'

// OpenEir — Settings → AI: provider chain, preset connect flow, agent harness.
//
//   1. Provider fallback chain — each row is one configured backend
//   2. "Connect" preset grid → live models.dev model combobox (always-current
//      models with context window, $/M pricing, freshness)
//   3. Agent harness panel — subscription auth via vendor CLIs (Claude Code,
//      Codex, Gemini CLI, OpenCode) + the Z.ai coding-plan bridge recipe

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Loader2, Trash2, PlayCircle, Star, Pencil, ChevronsUpDown, Eye,
  Terminal, Copy, KeyRound, Sparkles, CircleAlert, Cloud, Check, RefreshCw,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command, CommandEmpty, CommandInput, CommandItem, CommandList, CommandSeparator,
} from '@/components/ui/command'
import { useProviders } from '@/lib/api-client'
import { GatewayConfigInspector } from '@/components/settings/gateway-config-inspector'
import { toast } from 'sonner'
import { PROVIDER_PRESETS, presetById, type ProviderPreset } from '@/lib/ai/presets'

// ---------- shared shapes ----------

interface ProviderRowView {
  id: string
  label: string
  adapter: string
  baseUrl: string | null
  model: string | null
  enabled: boolean
  isDefault: boolean
  priority: number
  privacyMode: boolean
  hasKey: boolean
  lastStatus: string | null
  lastLatencyMs: number | null
}

interface CatalogModel {
  id: string
  name: string
  ctx: number | null
  in: number | null
  out: number | null
  reasoning: boolean
  tools: boolean
  vision: boolean
  released: string | null
}

interface DiscoveredCli {
  id: string
  cmd: string
  label: string
  vendor: string
  login: string
  installHint: string
  found: boolean
  version: string | null
  authLikely: boolean | null
  error?: string
}

const CLI_CHOICES = ['claude', 'codex', 'gemini', 'opencode']

// ---------- small helpers ----------

function fmtCtx(ctx: number | null): string {
  if (!ctx) return ''
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(ctx % 1_000_000 === 0 ? 0 : 1)}M`
  return `${Math.round(ctx / 1000)}k`
}

function fmtCost(m: CatalogModel): string {
  if (m.in == null && m.out == null) return ''
  const f = (n: number | null) => (n == null ? '?' : n === 0 ? '0' : `$${n}`)
  return `${f(m.in)}·${f(m.out)}/M`
}

function isNew(released: string | null): boolean {
  if (!released) return false
  return Date.now() - new Date(released).getTime() < 190 * 24 * 3600 * 1000
}

const KIND_BADGE: Record<string, { label: string; cls: string }> = {
  builtin: { label: 'gateway key', cls: 'border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300' },
  'api-key': { label: 'API key', cls: '' },
  'keyless-local': { label: 'local · offline', cls: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  harness: { label: 'subscription', cls: 'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300' },
}

// ---------- model combobox (live from models.dev) ----------

function ModelCombobox({ catalogId, value, onChange }: { catalogId: string; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [customMode, setCustomMode] = useState(false)
  const q = useQuery({
    queryKey: ['model-catalog', catalogId],
    queryFn: async () => {
      const res = await fetch(`/api/ai/models?provider=${encodeURIComponent(catalogId)}`)
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'catalog unavailable')
      return (await res.json()) as { models: CatalogModel[]; fetchedAt: string; stale?: boolean }
    },
    staleTime: 60 * 60 * 1000,
    retry: 1,
  })

  if (customMode || q.isError) {
    return (
      <div>
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1.5" placeholder="e.g. glm-4.7 / gpt-5.2" />
        <p className="mt-1 text-[11px] text-muted-foreground">
          {q.isError ? 'Live catalog unavailable — type the model id from the provider docs.' : 'Custom model id.'}
        </p>
      </div>
    )
  }

  const models = q.data?.models ?? []
  return (
    <div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="mt-1.5 w-full justify-between font-normal">
            <span className="truncate">{value || 'Search models…'}</span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[420px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search models…" />
            <CommandList className="max-h-[320px]">
              <CommandEmpty>No model matches.</CommandEmpty>
              {q.isLoading && (
                <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading live catalog from models.dev…
                </div>
              )}
              {models.map((m) => (
                <CommandItem
                  key={m.id}
                  value={`${m.name} ${m.id}`.toLowerCase()}
                  keywords={[m.id]}
                  onSelect={() => { onChange(m.id); setOpen(false) }}
                  className="items-start gap-2 py-2"
                >
                  <Check className={`mt-1 h-3.5 w-3.5 shrink-0 ${value === m.id ? 'opacity-100' : 'opacity-0'}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">{m.name}</span>
                      {isNew(m.released) && <Badge className="border-0 bg-teal-100 px-1.5 py-0 text-[9px] text-teal-800 dark:bg-teal-950 dark:text-teal-300">new</Badge>}
                      {m.reasoning && <Badge variant="outline" className="px-1.5 py-0 text-[9px]">reasoning</Badge>}
                      {m.vision && <Eye className="h-3 w-3 text-muted-foreground" aria-label="vision input" />}
                    </div>
                    <div className="truncate font-mono text-[10px] text-muted-foreground">{m.id}</div>
                  </div>
                  <div className="shrink-0 text-right text-[10px] leading-relaxed text-muted-foreground">
                    {fmtCtx(m.ctx) && <div>{fmtCtx(m.ctx)} ctx</div>}
                    {fmtCost(m) && <div className="tabular-nums">{fmtCost(m)}</div>}
                  </div>
                </CommandItem>
              ))}
              <CommandSeparator />
              <CommandItem onSelect={() => { setCustomMode(true); setOpen(false) }}>
                <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden /> Type a custom model id instead…
              </CommandItem>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {q.data && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          {models.length} models · synced {new Date(q.data.fetchedAt).toLocaleString()}{q.data.stale ? ' (stale — models.dev unreachable)' : ' · via models.dev'}
        </p>
      )}
    </div>
  )
}

// ---------- connect / edit dialog ----------

function ProviderDialog({
  open, onOpenChange, editing, preset, onClearPreset, onPresetPicked,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: ProviderRowView | null
  preset: ProviderPreset | null
  onClearPreset: () => void
  onPresetPicked: (p: ProviderPreset) => void
}) {
  const qc = useQueryClient()
  const [label, setLabel] = useState(editing?.label ?? preset?.label ?? '')
  const [adapter, setAdapter] = useState(editing?.adapter ?? preset?.adapter ?? 'openai_compatible')
  const [baseUrl, setBaseUrl] = useState(editing?.baseUrl ?? preset?.baseUrl ?? '')
  const [model, setModel] = useState(editing?.model ?? '')
  const [apiKey, setApiKey] = useState('')
  const [priority, setPriority] = useState(editing?.priority ?? 50)
  const isEdit = Boolean(editing)
  // form step only makes sense once a preset is picked (new) or when editing
  const showForm = isEdit || Boolean(preset)

  const needsUrl = adapter !== 'builtin_zai' && adapter !== 'cli'
  const needsKey = adapter !== 'builtin_zai' && adapter !== 'ollama' && adapter !== 'cli' && !(!isEdit && preset?.kind === 'keyless-local')
  const catalogId = !isEdit && preset?.modelsDevId ? preset.modelsDevId : null

  const save = useMutation({
    mutationFn: async () => {
      const payload = { label, adapter, baseUrl: baseUrl || null, model: model || null, apiKey: apiKey || null, priority }
      const res = editing
        ? await fetch(`/api/ai/providers/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/ai/providers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'Save failed')
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['providers'] })
      toast.success(editing ? 'Provider updated' : `${label} connected`)
      close()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const close = () => { onClearPreset(); onOpenChange(false) }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close() }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit AI provider' : preset ? `Connect ${preset.label}` : 'Connect a provider'}</DialogTitle>
        </DialogHeader>

        {/* step 1 — preset grid */}
        {showForm === false && (
          <div className="grid max-h-[55vh] gap-2 overflow-y-auto sm:grid-cols-2">
            {PROVIDER_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPresetPicked(p)}
                className="flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors hover:bg-accent"
              >
                <span className="flex w-full items-center justify-between gap-1">
                  <span className="text-sm font-semibold">{p.label}</span>
                  <Badge variant="outline" className={`shrink-0 px-1.5 py-0 text-[9px] ${KIND_BADGE[p.kind]?.cls ?? ''}`}>{KIND_BADGE[p.kind]?.label ?? p.kind}</Badge>
                </span>
                <span className="text-xs text-muted-foreground">{p.tagline}</span>
              </button>
            ))}
          </div>
        )}

        {/* step 2 — the form */}
        {showForm && (
          <div className="space-y-3">
            {!isEdit && preset && (
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                {preset.note ?? preset.tagline}
                {preset.keyUrl && (
                  <><br /><a href={preset.keyUrl} target="_blank" rel="noopener" className="mt-0.5 inline-flex items-center gap-1 text-teal-700 underline dark:text-teal-400">
                    <KeyRound className="h-3 w-3" aria-hidden /> Get a {preset.label} key</a>
                  </>
                )}
              </div>
            )}
            <div><Label>Label</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} className="mt-1.5" placeholder="My provider" /></div>

            {needsUrl && (
              <div><Label>Base URL</Label>
                <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="mt-1.5 font-mono text-xs" placeholder="https://openrouter.ai/api/v1" /></div>
            )}

            {adapter === 'cli' ? (
              <div><Label>Agent CLI</Label>
                <Select value={model || 'claude'} onValueChange={setModel}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{CLI_CHOICES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select></div>
            ) : adapter === 'builtin_zai' ? (
              <div><Label>Model (optional)</Label>
                <Input value={model} onChange={(e) => setModel(e.target.value)} className="mt-1.5" placeholder="default" />
                <p className="mt-1 text-[11px] text-muted-foreground">Leave empty for the built-in default.</p>
              </div>
            ) : catalogId ? (
              <div><Label>Model <span className="text-muted-foreground">· live catalog</span></Label>
                <ModelCombobox catalogId={catalogId} value={model} onChange={setModel} />
              </div>
            ) : (
              <div><Label>Model</Label>
                <Input value={model} onChange={(e) => setModel(e.target.value)} className="mt-1.5"
                  placeholder={adapter === 'ollama' ? 'llama3.1:8b  (from `ollama ls`)' : 'model id'} /></div>
            )}

            {needsKey && (
              <div><Label>API key {editing?.hasKey ? <span className="text-muted-foreground">(leave empty to keep stored key)</span> : ''}</Label>
                <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="mt-1.5" placeholder="sk-…" autoComplete="off" />
              </div>
            )}

            <div><Label>Priority <span className="text-muted-foreground">(lower tries first)</span></Label>
              <Input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} className="mt-1.5" /></div>

            <p className="text-[11px] text-muted-foreground">Keys are AES-256-GCM encrypted at rest on your server. Local providers never touch the network.</p>
          </div>
        )}

        <DialogFooter>
          {showForm && !isEdit && preset && <Button variant="ghost" onClick={onClearPreset}>← All providers</Button>}
          <Button variant="outline" onClick={close}>Cancel</Button>
          {showForm && (
            <Button onClick={() => save.mutate()} disabled={!label.trim() || save.isPending}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : isEdit ? 'Save changes' : 'Connect'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------- agent harness panel ----------

interface AgentsResponse {
  agents: DiscoveredCli[]
  zaiBridge: { title: string; lines: string[]; note: string }
  scannedAt: string
  cached: boolean
}

function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.round(m / 60)}h ago`
}

function HarnessPanel() {
  const qc = useQueryClient()
  const [recipeCopied, setRecipeCopied] = useState(false)
  const q = useQuery({
    queryKey: ['agent-clis'],
    queryFn: async (): Promise<AgentsResponse> => {
      const res = await fetch('/api/ai/agents')
      if (!res.ok) throw new Error('discovery failed')
      return (await res.json()) as AgentsResponse
    },
    staleTime: 30 * 1000,
  })

  // Buzz-style registry rescan: explicit, timestamped, non-disruptive.
  // Re-probes --version + credential files so a just-installed or
  // just-logged-in CLI shows up without a page reload.
  const scan = useMutation({
    mutationFn: async (): Promise<AgentsResponse> => {
      const res = await fetch('/api/ai/agents', { method: 'POST' })
      if (!res.ok) throw new Error('Rescan failed — try again in a moment')
      return (await res.json()) as AgentsResponse
    },
    onMutate: () => qc.getQueryData<AgentsResponse>(['agent-clis']),
    onSuccess: (data, _vars, prev) => {
      qc.setQueryData(['agent-clis'], data)
      const before = prev?.agents ?? []
      const newlyFound = data.agents.filter((a) => a.found && before.find((p) => p.id === a.id)?.found === false)
      const nowAuthed = data.agents.filter((a) => a.found && a.authLikely === true && before.find((p) => p.id === a.id)?.authLikely === false)
      if (newlyFound.length) toast.success(`New harness detected: ${newlyFound.map((a) => a.label).join(', ')} — ready to attach`)
      else if (nowAuthed.length) toast.success(`Login detected: ${nowAuthed.map((a) => a.label).join(', ')} — ready to attach`)
      else if (!data.agents.some((a) => a.found)) toast.info('No agent CLIs installed on this machine yet')
      else toast.success(`Rescan complete — ${data.agents.filter((a) => a.found).length} of ${data.agents.length} harnesses, no changes`)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const attach = useMutation({
    mutationFn: async (cli: DiscoveredCli) => {
      const res = await fetch('/api/ai/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: `${cli.label} (subscription)`, adapter: 'cli', model: cli.id, priority: 80 }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'Save failed')
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['providers'] })
      toast.success('Harness added to your provider chain')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const attached = new Set((useProviders().data?.providers ?? []).filter((p) => p.adapter === 'cli').map((p) => p.model))
  const [copiedId, setCopiedId] = useState<string | null>(null)

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Terminal className="h-4 w-4" aria-hidden /> Agent harness — use your subscriptions
          </CardTitle>
          <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs"
            disabled={scan.isPending} onClick={() => scan.mutate()}>
            <RefreshCw className={`h-3.5 w-3.5${scan.isPending ? ' animate-spin' : ''}`} aria-hidden />
            {scan.isPending ? 'Scanning…' : 'Rescan'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs leading-relaxed text-muted-foreground">
          ChatGPT Plus, Claude Pro/Max and Google accounts can only be used through the vendor&apos;s own CLI — their
          login tokens are scoped to it. OpenEir detects those CLIs on this machine and routes one-shot AI calls through
          them, so your subscription is used exactly as the vendor intended. Log in once in your terminal, then attach
          the harness below.
        </p>
        {scan.isPending && <p className="text-xs text-muted-foreground">Re-probing installed CLIs and credential files…</p>}
        {!scan.isPending && q.data?.scannedAt && (
          <p className="text-[11px] text-muted-foreground/80">
            Last scanned {ago(q.data.scannedAt)}{q.data.cached ? ' · served from cache' : ''} — use Rescan after installing or logging into a CLI.
          </p>
        )}
        {q.isLoading && <p className="text-sm text-muted-foreground">Scanning for agent CLIs…</p>}
        {q.data?.agents.map((cli) => (
          <div key={cli.id} className="rounded-xl border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{cli.label}</span>
                  {cli.found ? (
                    <Badge variant="outline" className="border-emerald-300 px-1.5 py-0 text-[9px] text-emerald-700 dark:border-emerald-800 dark:text-emerald-400">
                      detected{cli.version ? ` · ${cli.version}` : ''}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="px-1.5 py-0 text-[9px] text-muted-foreground">not installed</Badge>
                  )}
                  {cli.found && cli.authLikely === false && (
                    <Badge variant="outline" className="border-amber-300 px-1.5 py-0 text-[9px] text-amber-700 dark:border-amber-800 dark:text-amber-400">not logged in?</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">{cli.vendor}</div>
              </div>
              {cli.found && (
                <Button size="sm" variant="outline" className="shrink-0" disabled={attach.isPending || attached.has(cli.id)}
                  onClick={() => attach.mutate(cli)}>
                  {attached.has(cli.id) ? 'Attached' : 'Use as provider'}
                </Button>
              )}
            </div>
            <div className="mt-1.5 font-mono text-[11px] text-muted-foreground">
              {cli.found ? `login: ${cli.login}` : `install: ${cli.installHint}`}
            </div>
            {!cli.found && (
              <Button size="sm" variant="ghost" className="mt-1 h-6 gap-1 px-2 font-mono text-[10.5px]"
                onClick={() => {
                  void navigator.clipboard.writeText(cli.installHint)
                  setCopiedId(cli.id)
                  setTimeout(() => setCopiedId(null), 1500)
                }}>
                {copiedId === cli.id ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
                {copiedId === cli.id ? 'Copied — paste in your terminal' : 'Copy install command'}
              </Button>
            )}
          </div>
        ))}
        {q.data && (
          <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-900 dark:bg-violet-950/30">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-violet-900 dark:text-violet-200">{q.data.zaiBridge.title}</div>
              <Button size="sm" variant="ghost" className="h-7 gap-1 px-2"
                onClick={() => {
                  void navigator.clipboard.writeText(q.data.zaiBridge.lines.join('\n'))
                  setRecipeCopied(true)
                  setTimeout(() => setRecipeCopied(false), 1500)
                }}>
                {recipeCopied ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
                {recipeCopied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <pre className="mt-1.5 overflow-x-auto rounded-md bg-background/70 p-2 font-mono text-[10.5px] leading-relaxed text-violet-950 dark:text-violet-200">
              {q.data.zaiBridge.lines.join('\n')}
            </pre>
            <p className="mt-1 text-[11px] leading-relaxed text-violet-900/80 dark:text-violet-300/80">{q.data.zaiBridge.note}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------- main section ----------

export function AiProvidersSection() {
  const providers = useProviders()
  const qc = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ProviderRowView | null>(null)
  const [preset, setPreset] = useState<ProviderPreset | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<string | null>(null)

  const openNew = () => { setEditing(null); setPreset(null); setDialogOpen(true) }
  const onPresetPicked = (p: ProviderPreset) => { setPreset(p) }
  const openEdit = (p: ProviderRowView) => {
    setEditing(p)
    setPreset(presetById(rowToPresetId(p)) ?? null)
    setDialogOpen(true)
  }

  const patch = async (id: string, body: Record<string, unknown>) => {
    await fetch(`/api/ai/providers/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    void qc.invalidateQueries({ queryKey: ['providers'] })
  }

  const remove = async (id: string) => {
    await fetch(`/api/ai/providers/${id}`, { method: 'DELETE' })
    void qc.invalidateQueries({ queryKey: ['providers'] })
    toast.success('Provider removed')
  }

  const test = async (id: string) => {
    setTesting(id); setTestResult(null)
    try {
      const res = await fetch(`/api/ai/providers/${id}/test`, { method: 'POST' })
      const body = await res.json()
      setTestResult(body.detail ?? (body.ok ? 'Connected.' : 'Failed.'))
      void qc.invalidateQueries({ queryKey: ['providers'] })
    } catch {
      setTestResult('Test request failed.')
    } finally {
      setTesting(null)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
            <span>Provider chain — lowest priority number answers first</span>
            <Button size="sm" className="gap-1.5 border-primary/70 font-semibold text-white dark:text-[#06251f]" onClick={openNew}><Plus className="h-3.5 w-3.5" aria-hidden />Connect a provider</Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {providers.data?.builtin && !providers.data.builtin.configured && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">Built-in gateway is not configured on this machine</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-800/90 dark:text-amber-200/90">
                The built-in AI talks to a GLM gateway whose key lives in a <code className="rounded bg-amber-500/15 px-1 py-0.5 font-mono">.z-ai-config</code> JSON file ({'"'}baseUrl{'"'} + {'"'}apiKey{'"'}) at the project root, in your home directory, or at /etc/.z-ai-config — or set <code className="rounded bg-amber-500/15 px-1 py-0.5 font-mono">ZAI_API_KEY</code> + <code className="rounded bg-amber-500/15 px-1 py-0.5 font-mono">ZAI_BASE_URL</code> env vars and restart — the inspector below shows exactly which of these exist on this machine. No gateway? Connect any provider below — OpenRouter is one key for hundreds of models, and Ollama runs fully offline.
              </p>
            </div>
          )}
          {providers.data?.builtin?.configured && (
            <div className="rounded-xl border border-teal-500/30 bg-teal-500/10 px-3.5 py-2.5">
              <p className="text-xs text-teal-800 dark:text-teal-200">
                Built-in gateway ready — config from <code className="font-mono">{providers.data.builtin.source}</code>
              </p>
            </div>
          )}
          <GatewayConfigInspector defaultOpen={!providers.data?.builtin?.configured} />
          {providers.isLoading && <p className="py-4 text-sm text-muted-foreground">Loading…</p>}
          {providers.data?.providers.map((p) => (
            <div key={p.id} className={`rounded-xl border p-3.5 ${p.enabled ? '' : 'opacity-55'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {p.adapter === 'cli' ? <Terminal className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" aria-hidden />
                    : p.adapter === 'builtin_zai' ? <Sparkles className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden />
                    : <Cloud className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
                  <span className="truncate text-sm font-semibold">{p.label}</span>
                  {p.isDefault && <Badge className="border-0 bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300"><Star className="mr-1 h-3 w-3" aria-hidden />default</Badge>}
                  <Badge variant="outline" className="text-[10px]">{p.adapter}</Badge>
                  {p.privacyMode && <Badge variant="outline" className="text-[10px]">PII-stripped</Badge>}
                  {p.lastLatencyMs !== null && <span className="text-[10px] text-muted-foreground">{p.lastLatencyMs} ms</span>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Test ${p.label}`} onClick={() => test(p.id)} disabled={testing !== null}>
                    {testing === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <PlayCircle className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${p.label}`} onClick={() => openEdit(p)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Make default" onClick={() => patch(p.id, { isDefault: true, enabled: true })}>
                    <Star className="h-3.5 w-3.5" />
                  </Button>
                  <Switch checked={p.enabled} onCheckedChange={(v) => patch(p.id, { enabled: v })} aria-label={`Toggle ${p.label}`} />
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Delete provider" onClick={() => remove(p.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              </div>
              <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                {p.model ?? '—'}{p.baseUrl ? ` · ${p.baseUrl}` : ''} {p.hasKey ? '· key stored' : ''}
              </div>
              {p.lastStatus && !p.lastStatus.startsWith('ok') && (
                <div className="mt-1 flex items-start gap-1 truncate text-[11px] text-rose-600 dark:text-rose-400">
                  <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                  <span className="truncate">{p.lastStatus}</span>
                </div>
              )}
            </div>
          ))}
          {testResult && (
            <div className="rounded-lg border border-teal-200 bg-teal-50/60 px-3 py-2 text-xs text-teal-900 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200">{testResult}</div>
          )}
        </CardContent>
      </Card>

      <HarnessPanel />

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Recent AI usage</CardTitle></CardHeader>
        <CardContent>
          {providers.data?.usage.length ? (
            <div className="space-y-1.5">
              {providers.data.usage.slice(0, 8).map((u, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{u.purpose} · {u.providerLabel}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground">{u.latencyMs} ms</span>
                    <Badge variant="outline" className={`text-[10px] ${u.ok ? 'border-emerald-300 text-emerald-700 dark:text-emerald-400' : 'border-rose-300 text-rose-700 dark:text-rose-400'}`}>{u.ok ? 'ok' : 'failed'}</Badge>
                  </span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground">No AI calls yet.</p>}
        </CardContent>
      </Card>

      <ProviderDialog
        key={editing?.id ?? preset?.id ?? 'new'}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        preset={preset}
        onClearPreset={() => setPreset(null)}
        onPresetPicked={onPresetPicked}
      />
    </div>
  )
}

/** Best-effort preset match when editing an existing row (for dialog prefill). */
function rowToPresetId(p: ProviderRowView): string {
  if (p.adapter === 'builtin_zai') return 'builtin'
  if (p.adapter === 'cli') return 'harness'
  const byUrl = PROVIDER_PRESETS.find((x) => x.baseUrl && p.baseUrl?.startsWith(x.baseUrl))
  return byUrl?.id ?? 'custom'
}

export type { ProviderRowView }
