'use client'

// OpenEir — "Where does the gateway config live?" inspector for Settings → AI.
// Shows every path the built-in AI checks, whether it exists, its file
// metadata, and its parsed fields. Secret-looking values (apiKey, token) are
// masked on screen with a per-field reveal toggle, so the page is safe to
// screenshot or share while staying fully inspectable.

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BadgeCheck, CircleSlash, ChevronsUpDown, Eye, EyeOff, FileJson, Lock, RefreshCw, Variable,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible'

type PathReport = {
  path: string
  exists: boolean
  readable: boolean
  usable: boolean
  size: number | null
  mode: string | null
  modified: string | null
  fields: Record<string, string> | null
  error: string | null
}

type Report = {
  configured: boolean
  activeSource: string | null
  env: { hasApiKey: boolean; hasBaseUrl: boolean }
  paths: PathReport[]
}

const SENSITIVE_KEYS = new Set(['apikey', 'api_key', 'token', 'secret', 'password'])

function humanSize(bytes: number | null): string {
  if (bytes === null) return '—'
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function humanDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function MaskedValue({ value }: { value: string }) {
  const [revealed, setRevealed] = useState(false)
  const shown = revealed
    ? value
    : `${value.slice(0, 4)}${'•'.repeat(Math.min(20, Math.max(8, value.length - 4)))} (${value.length} chars)`
  return (
    <span className="inline-flex max-w-full items-center gap-1.5">
      <code className="min-w-0 break-all rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{shown}</code>
      <button
        type="button"
        aria-label={revealed ? 'Hide value' : 'Reveal value'}
        title={revealed ? 'Hide value' : 'Reveal value'}
        onClick={() => setRevealed((r) => !r)}
        className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        {revealed ? <EyeOff className="h-3 w-3" aria-hidden /> : <Eye className="h-3 w-3" aria-hidden />}
      </button>
    </span>
  )
}

export function GatewayConfigInspector({ defaultOpen = false }: { defaultOpen?: boolean }) {
  // null = the user hasn't touched it yet → follow the data (open when the
  // gateway is unconfigured, closed when it's ready).
  const [open, setOpen] = useState<boolean | null>(null)
  const q = useQuery<Report>({
    queryKey: ['gateway-config'],
    queryFn: async () => {
      const res = await fetch('/api/ai/gateway-config')
      if (!res.ok) throw new Error(`Inspector request failed (${res.status})`)
      return res.json() as Promise<Report>
    },
  })
  const effectiveOpen = open ?? (q.data ? !q.data.configured : defaultOpen)

  return (
    <Collapsible open={effectiveOpen} onOpenChange={(v) => setOpen(v)}>
      <div className="rounded-xl border border-teal-600/25 bg-teal-500/[0.04]">
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left">
          <span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-teal-900 dark:text-teal-200">
            <FileJson className="h-3.5 w-3.5 shrink-0 text-teal-700 dark:text-teal-400" aria-hidden />
            Gateway config inspector — where the file lives, what&apos;s inside
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </CollapsibleTrigger>
        <CollapsibleContent className="px-3.5 pb-3.5">
          {q.isLoading && <p className="py-2 text-xs text-muted-foreground">Reading config locations…</p>}
          {q.isError && (
            <p className="py-2 text-xs text-red-700 dark:text-red-400">
              Could not inspect this machine ({q.error instanceof Error ? q.error.message : 'unknown error'}).
            </p>
          )}
          {q.data && (
            <div className="space-y-2.5">
              {q.data.paths.map((p) => {
                const active = q.data?.activeSource === p.path
                return (
                  <div
                    key={p.path}
                    className={`rounded-lg border p-2.5 ${active ? 'border-teal-600/50 bg-teal-500/10' : 'bg-background/60'}`}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      {p.exists && p.usable
                        ? <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden />
                        : <CircleSlash className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden />}
                      <code className="min-w-0 truncate font-mono text-[11px] font-semibold">{p.path}</code>
                      {active && (
                        <Badge className="border-0 bg-teal-600 text-[10px] text-white">in use</Badge>
                      )}
                      {!p.exists && <Badge variant="outline" className="text-[10px]">not present</Badge>}
                      {p.exists && !p.usable && (
                        <Badge variant="outline" className="text-[10px] text-amber-700 dark:text-amber-400">
                          {p.error ?? 'not usable'}
                        </Badge>
                      )}
                    </div>
                    {p.exists && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {p.mode ?? '—'} · {humanSize(p.size)} · modified {humanDate(p.modified)}
                      </p>
                    )}
                    {p.fields && (
                      <dl className="mt-2 space-y-1">
                        {Object.entries(p.fields).map(([k, v]) => (
                          <div key={k} className="flex flex-wrap items-center gap-1.5">
                            <dt className="flex shrink-0 items-center gap-1 font-mono text-[11px] font-semibold text-teal-800 dark:text-teal-300">
                              {SENSITIVE_KEYS.has(k.toLowerCase())
                                ? <Lock className="h-2.5 w-2.5 text-muted-foreground" aria-hidden />
                                : null}
                              {k}
                            </dt>
                            <dd className="min-w-0">
                              {SENSITIVE_KEYS.has(k.toLowerCase())
                                ? <MaskedValue value={v} />
                                : <code className="break-all rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{v}</code>}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                )
              })}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-0.5 pt-0.5 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Variable className="h-3 w-3" aria-hidden />
                  ZAI_API_KEY: {q.data.env.hasApiKey ? 'set' : 'not set'} · ZAI_BASE_URL: {q.data.env.hasBaseUrl ? 'set' : 'not set'}
                </span>
                {q.data.activeSource && (
                  <span className="text-teal-800 dark:text-teal-300">
                    The app reads: <code className="font-mono">{q.data.activeSource}</code>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void q.refetch()}
                  className="ml-auto inline-flex items-center gap-1 transition-colors hover:text-foreground"
                >
                  <RefreshCw className={`h-3 w-3 ${q.isFetching ? 'animate-spin' : ''}`} aria-hidden />
                  Re-scan
                </button>
              </div>
            </div>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
