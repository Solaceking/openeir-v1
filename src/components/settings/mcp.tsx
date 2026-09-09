'use client'

// OpenEir — Settings → MCP.
// Two directions, one page:
//   1. CONNECT  — this instance talks to remote MCP servers (streamable HTTP).
//                 v1 scope: remote servers only, never local process spawning.
//   2. EXPOSE   — this instance IS an MCP server at /api/mcp, so desktop
//                 clients (Claude Desktop etc.) can read the household's data
//                 through four read-only tools with a personal token.
//   3. WebMCP   — experimental browser-native exposure: coming soon.

import { useEffect, useState } from 'react'
import {
  Cable, Plus, Loader2, Trash2, RefreshCw, ShieldCheck, Copy, Check,
  Server, Wrench, Eye, EyeOff, Globe, CircleAlert,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'

interface McpServerView {
  id: string; name: string; url: string; headerName: string
  enabled: boolean; status: string; lastError: string | null
  tools: Array<{ name: string; description?: string }>
  lastSeenAt: string | null
}

interface AccessState { enabled: boolean; rotatedAt: string | null }

const EXPOSED_TOOLS = [
  ['get_today_summary', 'Day summary: latest BP & glucose, meds status'],
  ['get_recent_readings', 'Recent BP / glucose readings, newest first'],
  ['get_medications_now', 'Active medications with today’s dose status'],
  ['get_profile_summary', 'Profile: name, conditions, targets, GP'],
]

// ---------------- Connect (client) ----------------

function ServersCard() {
  const [servers, setServers] = useState<McpServerView[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [headerName, setHeaderName] = useState('Authorization')
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [busy, setBusy] = useState(false)
  const [probing, setProbing] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = () => {
    fetch('/api/mcp/servers')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { servers?: McpServerView[] } | null) => setServers(d?.servers ?? []))
      .catch(() => setServers([]))
  }
  useEffect(load, [])

  const add = async () => {
    setBusy(true)
    try {
      const r = await fetch('/api/mcp/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url, headerName: headerName || 'Authorization', token: token || undefined }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Could not add server')
      toast.success(d.probe?.ok ? `Connected to ${d.probe.serverName ?? name}` : `${name} added`, { description: `${d.probe?.toolCount ?? 0} tool(s) discovered.` })
      setAdding(false); setName(''); setUrl(''); setToken('')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add server')
    } finally {
      setBusy(false)
    }
  }

  const patch = async (id: string, body: Record<string, unknown>) => {
    if (body.probe) setProbing(id)
    try {
      const r = await fetch(`/api/mcp/servers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (r.ok) { load(); if (body.probe) toast.success('Re-probed — tool list refreshed') }
    } finally {
      setProbing(null)
    }
  }

  const remove = async (id: string) => {
    await fetch(`/api/mcp/servers/${id}`, { method: 'DELETE' })
    toast.success('Server removed')
    load()
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <Cable className="mt-0.5 h-4 w-4 text-primary" aria-hidden />
            <div>
              <p className="text-sm font-semibold">Connect to MCP servers</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Remote servers over streamable HTTP — add a URL, inspect the tools it offers, enable what you trust.
                Local process spawning is deliberately out of scope in v1.
              </p>
            </div>
          </div>
          {!adding && (
            <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> Add server
            </Button>
          )}
        </div>

        {adding && (
          <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="mcp-name" className="text-xs">Name</Label>
                <Input id="mcp-name" className="mt-1 h-8 text-xs" value={name} onChange={(e) => setName(e.target.value)} placeholder="Weather tools" />
              </div>
              <div>
                <Label htmlFor="mcp-url" className="text-xs">Endpoint URL</Label>
                <Input id="mcp-url" className="mt-1 h-8 text-xs" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/mcp" />
              </div>
              <div>
                <Label htmlFor="mcp-hdr" className="text-xs">Auth header name</Label>
                <Input id="mcp-hdr" className="mt-1 h-8 text-xs" value={headerName} onChange={(e) => setHeaderName(e.target.value)} placeholder="Authorization" />
              </div>
              <div>
                <Label htmlFor="mcp-token" className="text-xs">Header value ({'optional'})</Label>
                <div className="relative">
                  <Input
                    id="mcp-token"
                    className="mt-1 h-8 pr-8 text-xs"
                    type={showToken ? 'text' : 'password'}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Bearer token / API key"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 mt-0.5 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setShowToken(!showToken)}
                    aria-label={showToken ? 'Hide token' : 'Show token'}
                  >
                    {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={add} disabled={busy || !name.trim() || !url.trim()} className="gap-1.5">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
                Add & test now
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {!servers && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> loading…</div>}
        {servers?.length === 0 && !adding && (
          <p className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
            No MCP servers connected yet. Anything you add here must speak the MCP streamable-HTTP protocol.
          </p>
        )}
        <div className="space-y-2">
          {servers?.map((s) => (
            <div key={s.id} className="rounded-xl border border-border/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {s.name}
                    {s.status === 'ok' && <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400">connected</Badge>}
                    {s.status === 'error' && <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400">error</Badge>}
                    {s.status === 'untested' && <Badge variant="outline" className="text-[10px] text-muted-foreground">untested</Badge>}
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">{s.tools.length} tools</Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{s.url}</p>
                  {s.status === 'error' && s.lastError && (
                    <p className="mt-1 flex items-start gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                      <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> {s.lastError}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Switch checked={s.enabled} onCheckedChange={(c) => void patch(s.id, { enabled: c })} aria-label={`Enable ${s.name}`} />
                  <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => void patch(s.id, { probe: true })} disabled={probing === s.id}>
                    {probing === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} re-probe
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                    <Wrench className="h-3 w-3" /> tools
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-muted-foreground" onClick={() => void remove(s.id)} aria-label={`Remove ${s.name}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {expanded === s.id && (
                <div className="mt-2 space-y-1 border-t border-border/40 pt-2">
                  {s.tools.length === 0 && <p className="text-xs text-muted-foreground">No tools discovered yet — try re-probe.</p>}
                  {s.tools.map((t) => (
                    <div key={t.name} className="rounded-lg bg-muted/40 px-2.5 py-1.5">
                      <p className="text-xs font-medium">{t.name}</p>
                      {t.description && <p className="text-[11px] leading-relaxed text-muted-foreground">{t.description}</p>}
                    </div>
                  ))}
                  <p className="pt-1 text-[10px] text-muted-foreground">Eir calling these tools inside chat lands in the next phase — discovery & audit first.</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------- Expose (server) ----------------

function ExposeCard() {
  const [access, setAccess] = useState<AccessState | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [copied, setCopied] = useState<'token' | 'json' | null>(null)
  const [busy, setBusy] = useState(false)
  const [origin, setOrigin] = useState('')

  useEffect(() => {
    setOrigin(window.location.origin)
    fetch('/api/mcp/access')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: AccessState | null) => setAccess(d ?? { enabled: false, rotatedAt: null }))
      .catch(() => setAccess({ enabled: false, rotatedAt: null }))
  }, [])

  const act = async (action: 'enable' | 'disable' | 'rotate') => {
    setBusy(true)
    try {
      const r = await fetch('/api/mcp/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Action failed')
      setAccess({ enabled: d.enabled, rotatedAt: d.rotatedAt ?? null })
      if (d.token) {
        setToken(d.token)
        toast.success('Access token created', { description: 'Copy it now — it is shown only once.' })
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  const copy = async (text: string, what: 'token' | 'json') => {
    await navigator.clipboard.writeText(text).catch(() => {})
    setCopied(what)
    setTimeout(() => setCopied(null), 1500)
  }

  const endpoint = `${origin}/api/mcp`
  const clientJson = JSON.stringify({ url: endpoint, headers: { Authorization: `Bearer <your-token>` } }, null, 2)

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <Server className="mt-0.5 h-4 w-4 text-primary" aria-hidden />
            <div>
              <p className="text-sm font-semibold">Expose this OpenEir via MCP</p>
              <p className="mt-0.5 max-w-md text-xs leading-relaxed text-muted-foreground">
                Desktop assistants (Claude Desktop, agents) connect to <code className="rounded bg-muted px-1">/api/mcp</code> and read
                your data through four read-only tools. Your token, your terms — every call is audit-logged.
              </p>
            </div>
          </div>
          <Switch
            checked={access?.enabled ?? false}
            disabled={busy || access === null}
            onCheckedChange={(c) => void act(c ? 'enable' : 'disable')}
            aria-label="Expose via MCP"
          />
        </div>

        {access?.enabled && (
          <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Endpoint</Label>
              <div className="mt-1 flex items-center gap-1.5">
                <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs">{endpoint}</code>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => void copy(endpoint, 'json')} aria-label="Copy endpoint">
                  {copied === 'json' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
            {token && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5">
                <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> New token — shown only once
                </p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1.5 font-mono text-xs">{token}</code>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => void copy(token, 'token')} aria-label="Copy token">
                    {copied === 'token' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            )}
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Client config (paste into your MCP client)</Label>
              <div className="mt-1 flex items-start gap-1.5">
                <pre className="min-w-0 flex-1 overflow-x-auto rounded bg-muted p-2 text-[11px] leading-relaxed">{clientJson}</pre>
                <Button size="sm" variant="ghost" className="h-7 w-7 shrink-0 p-0" onClick={() => void copy(clientJson, 'json')} aria-label="Copy client config">
                  {copied === 'json' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Tools any client may call</Label>
              <div className="mt-1 space-y-1">
                {EXPOSED_TOOLS.map(([n, d]) => (
                  <div key={n} className="flex items-start gap-2 rounded-lg bg-background px-2.5 py-1.5">
                    <Wrench className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                    <p className="text-xs"><b>{n}</b> — <span className="text-muted-foreground">{d}</span></p>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-2">
              <p className="text-[11px] text-muted-foreground">
                {access.rotatedAt ? `Token last rotated ${new Date(access.rotatedAt).toLocaleString()}` : 'Never rotated'}
              </p>
              <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => void act('rotate')} disabled={busy}>
                <RefreshCw className="h-3 w-3" aria-hidden /> Rotate token
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------- Page ----------------

export function McpSection() {
  return (
    <div className="space-y-4">
      <ServersCard />
      <ExposeCard />
      <Card>
        <CardContent className="flex items-start justify-between gap-3 p-5">
          <div className="flex items-start gap-2">
            <Globe className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden />
            <div>
              <div className="flex items-center gap-2 text-sm font-medium">
                WebMCP — expose tools straight to your browser
                <Badge variant="outline" className="text-[10px] text-muted-foreground">Coming soon</Badge>
              </div>
              <p className="mt-0.5 max-w-md text-xs leading-relaxed text-muted-foreground">
                The emerging WebMCP proposal lets the browser itself discover Eir&apos;s tools — no token copy-paste, no client config.
                We wire it up the day browsers ship it; the server side above already speaks the right shape.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
