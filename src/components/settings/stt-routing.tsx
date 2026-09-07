'use client'

// OpenEir — server-side STT routing editor (Settings → Voice & audio).
// The user picks the transcription order for the SERVER ear: local
// self-hosted Whisper (OpenAI-compatible), the built-in GLM gateway, and/or
// gateway providers (OmniRoute etc.). Mirrors the pattern used by
// Natively's provider registry, adapted to a web app.

import { useEffect, useState } from 'react'
import { Loader2, Mic } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

type Backend = 'local' | 'builtin' | 'gateway'

interface Routing {
  order: Backend[]
  localUrl: string
  localModel: string
}

const LABELS: Record<Backend, string> = {
  local: 'Local Whisper (self-hosted, never leaves your box)',
  builtin: 'Built-in gateway (GLM ASR)',
  gateway: 'AI providers (OmniRoute → Groq/OpenAI…)',
}

export function SttRoutingEditor() {
  const [routing, setRouting] = useState<Routing | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

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
      await fetch('/api/voice/stt', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
    } catch { /* picker keeps local state; retried on next change */ }
    setSaving(false)
  }

  const toggle = (id: Backend, on: boolean) => {
    if (!routing) return
    const order = on
      ? [...routing.order, id]
      : routing.order.filter((x) => x !== id)
    if (!order.length) return // at least one backend must remain
    save({ ...routing, order: order as Routing['order'] })
  }

  const move = (id: Backend, dir: -1 | 1) => {
    if (!routing) return
    const order = [...routing.order]
    const i = order.indexOf(id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= order.length) return
    ;[order[i], order[j]] = [order[j], order[i]]
    save({ ...routing, order: order as Routing['order'] })
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
    <div className="mt-2 space-y-2">
      {/* ordered chips */}
      <div className="space-y-1.5">
        {routing.order.map((id, idx) => (
          <div key={id} className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2.5 py-1.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="w-4 text-center text-[11px] tabular-nums text-muted-foreground">{idx + 1}</span>
              <span className="truncate text-xs">{LABELS[id]}</span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={() => move(id, -1)} disabled={idx === 0} aria-label={`Move ${id} up`}>↑</Button>
              <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={() => move(id, 1)} disabled={idx === routing.order.length - 1} aria-label={`Move ${id} down`}>↓</Button>
              <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs text-muted-foreground" onClick={() => toggle(id, false)} aria-label={`Disable ${id}`}>✕</Button>
            </div>
          </div>
        ))}
      </div>

      {/* available backends not in the chain */}
      {(['local', 'builtin', 'gateway'] as Backend[]).filter((id) => !routing.order.includes(id)).map((id) => (
        <div key={id} className="flex items-center justify-between gap-2 rounded-md border border-dashed border-border/60 px-2.5 py-1.5 opacity-70">
          <span className="truncate text-xs text-muted-foreground">{LABELS[id]}</span>
          <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={() => toggle(id, true)}>enable</Button>
        </div>
      ))}

      {/* local whisper details */}
      {routing.order.includes('local') && (
        <div className="rounded-md border border-border/60 bg-muted/30 p-2.5">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label className="text-[11px] text-muted-foreground">Server URL (OpenAI-compatible)</Label>
              <Input
                className="mt-1 h-8 text-xs"
                value={routing.localUrl}
                onChange={(e) => setRouting({ ...routing, localUrl: e.target.value })}
                onBlur={() => save(routing)}
                placeholder="http://localhost:8630/v1"
              />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Model</Label>
              <Input
                className="mt-1 h-8 text-xs"
                value={routing.localModel}
                onChange={(e) => setRouting({ ...routing, localModel: e.target.value })}
                onBlur={() => save(routing)}
                placeholder="large-v3"
              />
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
  )
}
