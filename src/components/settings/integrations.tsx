'use client'

// OpenEir — Settings → Integrations: the plugin manager + roadmap.
// v1 installs plugins from a MANIFEST URL only (no gallery yet): paste a URL,
// review exactly what the plugin asks for, enable it, and OpenEir mints a
// scoped access token the plugin must present. A plugin never sees more than
// its scopes. Everything we do not ship yet shows up honestly as Coming soon.

import { useEffect, useState } from 'react'
import {
  Blocks, Plus, Loader2, Trash2, ShieldCheck, Copy, Check, Activity,
  Link2, CalendarClock, MessageCircle, Bluetooth, Store,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'

interface PluginView {
  id: string; name: string; manifestUrl: string; version: string; description: string
  baseUrl: string | null; scopes: string[]; enabled: boolean; health: string; lastSeenAt: string | null
}

const SCOPE_INFO: Record<string, string> = {
  'read:vitals': 'Read blood pressure & glucose readings',
  'read:meds': 'Read the medication list and today’s dose status',
  'read:profile': 'Read the profile (name, conditions, targets)',
  'read:export': 'Download a full data export',
  'post:insights': 'Post insights onto your dashboard',
}

const COMING_SOON = [
  { icon: Store, title: 'Plugin gallery', blurb: 'One-click community plugins, reviewed and versioned — replaces the manual manifest URL.' },
  { icon: CalendarClock, title: 'Calendar sync', blurb: 'Appointments and check-ins synced to your own calendar (CalDAV first).' },
  { icon: MessageCircle, title: 'WhatsApp / SMS reminders', blurb: 'Medication nudges through the channels you actually read.' },
  { icon: Bluetooth, title: 'Bluetooth device hub', blurb: 'One screen for cuff, CGM and scale pairings with battery health.' },
]

function HealthDot({ health }: { health: string }) {
  const color = health === 'healthy' ? 'bg-emerald-500' : health === 'unreachable' ? 'bg-amber-500' : 'bg-muted-foreground/40'
  const label = health === 'healthy' ? 'healthy' : health === 'unreachable' ? 'unreachable' : 'never pinged'
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
      <Activity className={`h-3 w-3 ${color}`} aria-hidden /> {label}
    </span>
  )
}

export function IntegrationsSection() {
  const [plugins, setPlugins] = useState<PluginView[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [manifestUrl, setManifestUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [newToken, setNewToken] = useState<{ name: string; token: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const load = () => {
    fetch('/api/plugins')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { plugins?: PluginView[] } | null) => setPlugins(d?.plugins ?? []))
      .catch(() => setPlugins([]))
  }
  useEffect(load, [])

  const install = async () => {
    setBusy(true)
    try {
      const r = await fetch('/api/plugins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manifestUrl }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Install failed')
      setNewToken({ name: d.plugin.name, token: d.token })
      setAdding(false)
      setManifestUrl('')
      load()
      toast.success(`${d.plugin.name} installed`, { description: 'Copy the access token now — it is shown only once.' })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Install failed')
    } finally {
      setBusy(false)
    }
  }

  const patch = async (id: string, body: Record<string, unknown>) => {
    await fetch(`/api/plugins/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    load()
  }

  const remove = async (id: string) => {
    await fetch(`/api/plugins/${id}`, { method: 'DELETE' })
    toast.success('Plugin removed — its token stops working immediately')
    load()
  }

  const copyToken = async () => {
    if (!newToken) return
    await navigator.clipboard.writeText(newToken.token).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="space-y-4">
      {/* ---- Plugins ---- */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <Blocks className="mt-0.5 h-4 w-4 text-primary" aria-hidden />
              <div>
                <p className="text-sm font-semibold">Plugins</p>
                <p className="mt-0.5 max-w-md text-xs leading-relaxed text-muted-foreground">
                  Install from a manifest URL — review the permissions, then enable. Plugins authenticate with a scoped
                  token you mint here, so a vitals-reading plugin can never touch anything else.
                </p>
              </div>
            </div>
            {!adding && (
              <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={() => setAdding(true)}>
                <Plus className="h-3.5 w-3.5" aria-hidden /> Install from URL
              </Button>
            )}
          </div>

          {adding && (
            <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
              <Label htmlFor="plugin-url" className="flex items-center gap-1.5 text-xs"><Link2 className="h-3 w-3" aria-hidden /> Manifest URL</Label>
              <Input
                id="plugin-url"
                className="h-8 text-xs"
                value={manifestUrl}
                onChange={(e) => setManifestUrl(e.target.value)}
                placeholder="https://your-server/plugin-manifest.json"
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                The manifest is a small JSON: <code className="rounded bg-muted px-1">{`{ "name", "version", "description", "baseUrl", "scopes" }`}</code>.
                See docs/PLUGINS.md for the exact shape.
              </p>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={install} disabled={busy || !manifestUrl.trim()} className="gap-1.5">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
                  Fetch & review
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {newToken && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> {newToken.name}&apos;s access token — shown only once
              </p>
              <div className="mt-1.5 flex items-center gap-1.5">
                <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1.5 font-mono text-xs">{newToken.token}</code>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={copyToken} aria-label="Copy token">
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Paste it into the plugin&apos;s config as its Bearer token. Revoke any time — the plugin loses access instantly.
              </p>
              <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" onClick={() => setNewToken(null)}>Done, I saved it</Button>
            </div>
          )}

          {!plugins && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> loading…</div>}
          {plugins?.length === 0 && !adding && (
            <p className="rounded-lg border border-dashed border-border/60 p-3 text-xs leading-relaxed text-muted-foreground">
              No plugins installed yet. This instance keeps everything in its own database — a plugin only gets what you
              explicitly grant, and you can revoke it in one click.
            </p>
          )}
          <div className="space-y-2">
            {plugins?.map((p) => (
              <div key={p.id} className="rounded-xl border border-border/60 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {p.name}
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">v{p.version}</Badge>
                      <HealthDot health={p.health} />
                    </div>
                    {p.description && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{p.description}</p>}
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">{p.manifestUrl}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {p.scopes.length === 0 && <span className="text-[10px] text-muted-foreground">no scopes granted</span>}
                      {p.scopes.map((s) => (
                        <Badge key={s} variant="outline" className="text-[10px] text-primary">{SCOPE_INFO[s] ?? s}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {p.baseUrl && (
                      <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => void patch(p.id, { ping: true })}>
                        <Activity className="h-3 w-3" /> ping
                      </Button>
                    )}
                    <Switch checked={p.enabled} onCheckedChange={(c) => void patch(p.id, { enabled: c })} aria-label={`Enable ${p.name}`} />
                    <Button size="sm" variant="ghost" className="h-7 text-muted-foreground" onClick={() => void remove(p.id)} aria-label={`Remove ${p.name}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ---- Coming soon ---- */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold">On the roadmap</p>
            <span className="text-[11px] text-muted-foreground">we ship these when they are actually ready</span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {COMING_SOON.map((c) => (
              <div key={c.title} className="rounded-xl border border-dashed border-border/60 p-3 opacity-80">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <c.icon className="h-4 w-4 text-muted-foreground" aria-hidden /> {c.title}
                  </div>
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">Coming soon</Badge>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{c.blurb}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
