'use client'

// OpenEir — STT provider manager (Settings → Voice & audio).
// Mirrors the AI-provider settings page: a preset gallery (popular / free /
// cheap / local), each card pre-fills a provider row; rows are ordered into
// the fallback chain the server actually calls. Nothing hidden — what you
// see here IS the chain (plus the legacy 'gateway' pseudo-row that walks the
// AI providers, kept for setups that already rely on it).

import { useEffect, useState } from 'react'
import { Loader2, Mic, Plus, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { STT_PROVIDER_PRESETS, type SttProviderPreset } from '@/lib/voice/stt-presets'

type Backend = 'local' | 'gateway'

interface ProviderRow {
  id: string
  label: string
  baseUrl: string
  model: string
  hasKey?: boolean
  apiKey?: string
  enabled: boolean
}

interface Routing {
  providers: ProviderRow[]
  order: string[]
  localUrl: string
  localModel: string
}

const PSEUDO: Record<string, string> = {
  local: 'Local Whisper (legacy single-server row)',
  gateway: 'AI providers chain (OmniRoute → whisper-hosting rows)',
}

export function SttRoutingEditor() {
  const [routing, setRouting] = useState<Routing | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [galleryOpen, setGalleryOpen] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/voice/stt')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { routing?: Routing } | null) => { if (alive && d?.routing) setRouting(d.routing) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const save = async (next: Routing) => {
    setRouting(next)
    setSaving(true)
    try {
      const res = await fetch('/api/voice/stt', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order: next.order,
          localUrl: next.localUrl,
          localModel: next.localModel,
          providers: next.providers.map(({ hasKey, ...p }) => p),
        }),
      })
      if (res.ok) {
        const d = (await res.json()) as { routing?: Routing }
        if (d.routing) setRouting(d.routing) // server strips keys → hasKey flags
      }
    } catch { /* picker keeps local state; retried on next change */ }
    setSaving(false)
  }

  const labelFor = (id: string) =>
    routing?.providers.find((p) => p.id === id)?.label ?? PSEUDO[id] ?? id

  const addPreset = (preset: SttProviderPreset) => {
    if (!routing) return
    const id = preset.id === 'custom' ? `custom-${Date.now().toString(36)}` : preset.id
    if (routing.providers.some((p) => p.id === id)) {
      setGalleryOpen(false)
      return
    }
    const row: ProviderRow = {
      id, label: preset.label, baseUrl: preset.baseUrl, model: preset.model, enabled: true,
    }
    const next: Routing = {
      ...routing,
      providers: [...routing.providers, row],
      order: [...routing.order, id],
    }
    setGalleryOpen(false)
    save(next)
  }

  const updateProvider = (id: string, patch: Partial<ProviderRow>) => {
    if (!routing) return
    save({
      ...routing,
      providers: routing.providers.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })
  }

  const removeProvider = (id: string) => {
    if (!routing) return
    save({
      ...routing,
      providers: routing.providers.filter((p) => p.id !== id),
      order: routing.order.filter((x) => x !== id),
    })
  }

  const move = (id: string, dir: -1 | 1) => {
    if (!routing) return
    const order = [...routing.order]
    const i = order.indexOf(id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= order.length) return
    ;[order[i], order[j]] = [order[j], order[i]]
    save({ ...routing, order })
  }

  const testLocal = async () => {
    if (!routing) return
    setTesting(true)
    setTestResult(null)
    try {
      const health = await fetch(`${routing.localUrl.replace(/\/v1$/, '')}/health`, { signal: AbortSignal.timeout(5000) })
      const h = health.ok ? await health.json() : null
      setTestResult(h
        ? `Connected — model ${h.model}, ${h.ready ? 'ready' : 'still loading'} on ${h.device ?? '…'}`
        : 'No response — is the whisper server running?')
    } catch {
      setTestResult('No response — is the whisper server running?')
    }
    setTesting(false)
  }

  if (!routing) {
    return <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> loading transcription settings…</div>
  }

  return (
    <div className="mt-2 space-y-3">
      {/* the chain — what the server calls, in order */}
      <div className="space-y-1.5">
        {routing.order.map((id, idx) => (
          <div key={id} className="rounded-md border border-border/60 bg-background px-2.5 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="w-4 text-center text-[11px] tabular-nums text-muted-foreground">{idx + 1}</span>
                <span className="truncate text-xs font-medium">{labelFor(id)}</span>
                {id === 'local' && <span className="shrink-0 rounded bg-emerald-600/10 px-1.5 py-0.5 text-[10px] text-emerald-700">self-hosted</span>}
                {id === 'gateway' && <span className="shrink-0 rounded bg-sky-600/10 px-1.5 py-0.5 text-[10px] text-sky-700">via AI providers</span>}
                {routing.providers.find((p) => p.id === id)?.hasKey && <span className="shrink-0 text-[10px] text-muted-foreground">🔑</span>}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={() => move(id, -1)} disabled={idx === 0} aria-label={`Move ${id} up`}>↑</Button>
                <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={() => move(id, 1)} disabled={idx === routing.order.length - 1} aria-label={`Move ${id} down`}>↓</Button>
                <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs text-muted-foreground" onClick={() => removeProvider(id)} aria-label={`Remove ${id}`}>✕</Button>
              </div>
            </div>

            {/* provider row details */}
            {routing.providers.map((p) => p.id === id ? (
              <div key={p.id} className="mt-2 grid gap-2 border-t border-border/40 pt-2 sm:grid-cols-3">
                <div className="sm:col-span-3">
                  <Label className="text-[11px] text-muted-foreground">Base URL (OpenAI-compatible /audio/transcriptions)</Label>
                  <Input className="mt-1 h-8 text-xs" value={p.baseUrl}
                    onChange={(e) => setRouting({ ...routing, providers: routing.providers.map((x) => x.id === id ? { ...x, baseUrl: e.target.value } : x) })}
                    onBlur={() => updateProvider(id, {})} placeholder="https://api.groq.com/openai/v1" />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Model</Label>
                  <Input className="mt-1 h-8 text-xs" value={p.model}
                    onChange={(e) => setRouting({ ...routing, providers: routing.providers.map((x) => x.id === id ? { ...x, model: e.target.value } : x) })}
                    onBlur={() => updateProvider(id, {})} placeholder="whisper-large-v3-turbo" />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-[11px] text-muted-foreground">API key {p.hasKey && <span className="text-emerald-600">(saved — paste to replace)</span>}</Label>
                  <Input className="mt-1 h-8 text-xs" type="password" placeholder={p.hasKey ? '••••••••' : 'paste key…'}
                    onChange={(e) => setRouting({ ...routing, providers: routing.providers.map((x) => x.id === id ? { ...x, apiKey: e.target.value } : x) })}
                    onBlur={() => updateProvider(id, {})} />
                </div>
              </div>
            ) : null)}

            {/* legacy local whisper row details */}
            {id === 'local' && (
              <div className="mt-2 rounded-md bg-muted/30 p-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Server URL (OpenAI-compatible)</Label>
                    <Input className="mt-1 h-8 text-xs" value={routing.localUrl}
                      onChange={(e) => setRouting({ ...routing, localUrl: e.target.value })}
                      onBlur={() => save(routing)} placeholder="http://localhost:8630/v1" />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Model</Label>
                    <Input className="mt-1 h-8 text-xs" value={routing.localModel}
                      onChange={(e) => setRouting({ ...routing, localModel: e.target.value })}
                      onBlur={() => save(routing)} placeholder="large-v3" />
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={testLocal} disabled={testing}>
                    {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mic className="h-3 w-3" />}
                    Test connection
                  </Button>
                  {saving && <span className="text-[11px] text-muted-foreground">saving…</span>}
                  {testResult && <span className="text-[11px] text-muted-foreground">{testResult}</span>}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* add from gallery */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setGalleryOpen(!galleryOpen)}>
          {galleryOpen ? <RotateCcw className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          {galleryOpen ? 'Close' : 'Add speech-to-text provider'}
        </Button>
        {saving && <span className="text-[11px] text-muted-foreground">saving…</span>}
      </div>

      {galleryOpen && (
        <div className="grid gap-2 sm:grid-cols-2">
          {STT_PROVIDER_PRESETS.map((preset) => {
            const added = routing.providers.some((p) => p.id === preset.id) || (preset.id !== 'custom' && routing.order.includes(preset.id))
            return (
              <button
                key={preset.id}
                type="button"
                disabled={added}
                onClick={() => addPreset(preset)}
                className="rounded-lg border border-border/60 bg-background p-3 text-left transition-colors hover:border-primary/40 disabled:opacity-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">{preset.label}</span>
                  {preset.price && <span className="rounded bg-amber-600/10 px-1.5 py-0.5 text-[10px] text-amber-700">{preset.price}</span>}
                  {preset.kind === 'keyless-local' && <span className="rounded bg-emerald-600/10 px-1.5 py-0.5 text-[10px] text-emerald-700">local</span>}
                </div>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{preset.tagline}</p>
                {preset.note && <p className="mt-1 text-[10px] leading-4 text-muted-foreground/70">{preset.note}</p>}
                {preset.keyUrl && (
                  <a href={preset.keyUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                    className="mt-1.5 inline-block text-[10px] text-primary underline underline-offset-2">
                    get a key ↗
                  </a>
                )}
                <span className="mt-1.5 block text-[10px] font-medium text-primary">{added ? 'already added' : '+ add'}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
