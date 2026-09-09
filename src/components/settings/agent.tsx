'use client'

// OpenEir — Settings → AI agent.
// One pane for the agent's authority and accountability:
//   · permissions  — which tool categories Eir may use at all
//   · pending      — actions awaiting human confirmation (with voice-origin cards)
//   · audit        — every tool call: who, what, why, provider, latency, outcome
//   · usage        — per-tool call counts and latency (extends the AiUsage view)

import { useCallback, useEffect, useState } from 'react'
import { Bot, ShieldCheck, ShieldAlert, ClipboardList, BarChart3, Loader2, Check, X, RefreshCcw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'

interface Governance {
  permissions: { write: boolean; destructive: boolean }
  tools: Array<{ name: string; description: string; category: string; risk: string }>
  recent: Array<{
    id: string; tool: string; category: string; risk: string
    status: string; outcome: string | null; origin: string
    providerLabel: string | null; model: string | null; latencyMs: number
    reason: string | null; error: string | null; createdAt: string
  }>
  counts: Array<{ status: string; count: number }>
  byTool: Array<{ tool: string; calls: number; avgLatencyMs: number }>
}

interface PendingRow {
  id: string; tool: string; readback: string; risk: string
  status: string; origin: string; createdAt: string
}

const STATUS_I18N: Record<string, string> = {
  executed: 'agent.statusExecuted',
  pending: 'agent.statusPending',
  confirmed: 'agent.statusConfirmed',
  declined: 'agent.statusDeclined',
  refused: 'agent.statusRefused',
  error: 'agent.statusError',
  expired: 'agent.statusExpired',
}

function statusChip(status: string): string {
  switch (status) {
    case 'executed':
    case 'confirmed':
      return 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20'
    case 'pending':
      return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20'
    case 'declined':
    case 'expired':
      return 'bg-muted text-muted-foreground border-border'
    case 'refused':
      return 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20'
    default:
      return 'bg-destructive/10 text-destructive border-destructive/20'
  }
}

function originLabel(origin: string, t: (k: string) => string): string {
  if (origin === 'realtime' || origin === 'voice') return t('agent.originRealtime')
  if (origin === 'rpc') return t('agent.originRpc')
  return t('agent.originChat')
}

export function AgentSection() {
  const { t } = useT()
  const [data, setData] = useState<Governance | null>(null)
  const [pending, setPending] = useState<PendingRow[]>([])
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [phrase, setPhrase] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    try {
      const [g, p] = await Promise.all([
        fetch('/api/agent-governance').then((r) => r.json()),
        fetch('/api/agent-governance?pending=1').then((r) => r.json()),
      ])
      if (g?.permissions) setData(g)
      if (p?.pending) setPending(p.pending)
    } catch { /* non-fatal */ }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const savePermissions = async (patch: { write?: boolean; destructive?: boolean }) => {
    setSaving(true)
    try {
      const res = await fetch('/api/agent-governance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (res.ok) void load()
      else toast.error(t('talk.cardFailed'))
    } finally {
      setSaving(false)
    }
  }

  const resolve = async (id: string, decision: 'confirm' | 'decline', row: PendingRow) => {
    setBusyId(id)
    try {
      const res = await fetch('/api/chat/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, decision, ...(row.risk === 'high' ? { phrase: (phrase[id] ?? '').trim() } : {}) }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) toast.error(j?.error ?? t('talk.cardFailed'))
      else toast(decision === 'confirm' ? t('talk.cardSaved') : t('talk.discarded'))
      void load()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* ---- permissions ---- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" aria-hidden /> {t('agent.toolsHeading')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{t('agent.toolsHint')}</p>
          {!data && <Skeleton className="h-24" />}
          {data && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t('agent.catRead')}</p>
                  <p className="text-xs text-muted-foreground">{t('agent.catReadHint')}</p>
                </div>
                <Switch checked disabled aria-label={t('agent.catRead')} />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t('agent.catWrite')}</p>
                  <p className="text-xs text-muted-foreground">{t('agent.catWriteHint')}</p>
                </div>
                <Switch
                  checked={data.permissions.write}
                  disabled={saving}
                  onCheckedChange={(v) => void savePermissions({ write: v })}
                  aria-label={t('agent.catWrite')}
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/25 bg-card px-3 py-2.5">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-medium"><ShieldAlert className="h-3.5 w-3.5 text-destructive" aria-hidden /> {t('agent.catDestructive')}</p>
                  <p className="text-xs text-muted-foreground">{t('agent.catDestructiveHint')}</p>
                </div>
                <Switch
                  checked={data.permissions.destructive}
                  disabled={saving}
                  onCheckedChange={(v) => void savePermissions({ destructive: v })}
                  aria-label={t('agent.catDestructive')}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- pending confirmations ---- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="h-4 w-4 text-amber-600 dark:text-amber-300" aria-hidden /> {t('agent.pendingHeading')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {pending.length === 0 && <p className="text-sm text-muted-foreground">{t('agent.pendingEmpty')}</p>}
          {pending.map((p) => (
            <div key={p.id} className="rounded-xl border bg-card px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{t(`agent.tools.${p.tool}`, { defaultValue: p.tool })}</span>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${p.risk === 'high' ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}>
                  {p.risk === 'high' ? t('talk.highRisk') : t('agent.statusPending')}
                </span>
                <span className="text-[10px] text-muted-foreground">{originLabel(p.origin, t)}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{p.readback}</p>
              {p.risk === 'high' && (
                <Input
                  value={phrase[p.id] ?? ''}
                  onChange={(e) => setPhrase((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  placeholder="CONFIRM"
                  className="mt-2 h-8 w-40 uppercase tracking-widest"
                  aria-label={t('talk.typeToConfirm')}
                />
              )}
              <div className="mt-2 flex items-center gap-2">
                <Button size="sm" className="h-7 rounded-full px-3" disabled={busyId === p.id || (p.risk === 'high' && (phrase[p.id] ?? '').trim().toUpperCase() !== 'CONFIRM')} onClick={() => void resolve(p.id, 'confirm', p)}>
                  {busyId === p.id ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Check className="h-3 w-3" aria-hidden />} {t('talk.confirmSave')}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 rounded-full px-3 text-muted-foreground" disabled={busyId === p.id} onClick={() => void resolve(p.id, 'decline', p)}>
                  <X className="h-3 w-3" aria-hidden /> {t('talk.discard')}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ---- audit trail ---- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2"><Bot className="h-4 w-4 text-primary" aria-hidden /> {t('agent.auditHeading')}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void load()} aria-label={t('talk.retry')}>
              <RefreshCcw className="h-3.5 w-3.5" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data && data.counts.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {data.counts.map((c) => (
                <span key={c.status} className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusChip(c.status)}`}>
                  {t(STATUS_I18N[c.status] ?? 'agent.toolLabel', { defaultValue: c.status })}: {c.count}
                </span>
              ))}
            </div>
          )}
          {(!data || data.recent.length === 0) && <p className="text-sm text-muted-foreground">{t('agent.auditEmpty')}</p>}
          {data?.recent.slice(0, 15).map((r) => (
            <div key={r.id} className="rounded-xl border bg-card px-3 py-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-medium">{t(`agent.tools.${r.tool}`, { defaultValue: r.tool })}</span>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusChip(r.status)}`}>
                  {t(STATUS_I18N[r.status] ?? 'agent.toolLabel', { defaultValue: r.status })}
                </span>
                <span className="text-[10px] text-muted-foreground">{originLabel(r.origin, t)}</span>
                {r.providerLabel && <span className="text-[10px] text-muted-foreground">· {r.providerLabel}{r.model ? ` / ${r.model}` : ''}</span>}
                <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                  {new Date(r.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  {r.latencyMs > 0 ? ` · ${r.latencyMs}ms` : ''}
                </span>
              </div>
              {(r.outcome || r.error || r.reason) && (
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  {r.error ? `${r.error}` : r.outcome ?? ''}{r.reason ? ` — "${r.reason}"` : ''}
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ---- per-tool usage (extends AiUsage into tool space) ---- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4 text-primary" aria-hidden /> {t('agent.statsHeading')}</CardTitle>
        </CardHeader>
        <CardContent>
          {(!data || data.byTool.length === 0) && <p className="text-sm text-muted-foreground">{t('agent.auditEmpty')}</p>}
          {data && data.byTool.length > 0 && (
            <div className="space-y-1.5">
              {data.byTool.map((s) => (
                <div key={s.tool} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{t(`agent.tools.${s.tool}`, { defaultValue: s.tool })}</span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">{s.calls} {t('agent.statCalls')}</span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">{t('agent.statAvg')} {s.avgLatencyMs}ms</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
