// OpenEir — Settings → Memory: what Eir remembers, tier inspector + nightly reflection.

'use client'

import { useState } from 'react'
import { Brain, Pin, PinOff, Trash2, Plus, MoonStar, Loader2, Sparkles } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { useMemories, useMemoryMutations } from '@/lib/api-client'

const TIER_META: Record<string, { label: string; hint: string; badge: string }> = {
  core: { label: 'Core', hint: 'Pinned essentials — never forgotten', badge: 'bg-primary/10 text-primary border-primary/20' },
  semantic: { label: 'Learned', hint: 'Durable facts worth keeping', badge: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-400' },
  episodic: { label: 'Recent', hint: 'Day-to-day notes — fade after 30 days unless recalled', badge: 'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-400' },
}

export function MemorySection() {
  const memories = useMemories()
  const m = useMemoryMutations()
  const [draft, setDraft] = useState('')
  const [draftPinned, setDraftPinned] = useState(false)

  const add = () => {
    const content = draft.trim()
    if (content.length < 4) return
    m.add.mutate({ content, pinned: draftPinned })
    setDraft('')
    setDraftPinned(false)
  }

  const data = memories.data

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><Brain className="h-4 w-4 text-primary" aria-hidden /> What Eir remembers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            As you talk with Eir, durable facts land here — preferences, family, doctor advice, plans. They are injected
            into every conversation so Eir stays continuous across threads. Core entries never fade; recent notes fade
            after 30 days unless she keeps recalling them. Everything stays in your own database.
          </p>

          {memories.isLoading && <div className="space-y-2"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>}

          {data && (
            <>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(TIER_META) as string[]).map((tier) => (
                  <Badge key={tier} variant="outline" className={`${TIER_META[tier].badge} text-xs`}>
                    {TIER_META[tier].label}: {data.counts[tier as keyof typeof data.counts] ?? 0}
                  </Badge>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') add() }}
                  placeholder="Teach Eir something — “User's daughter Emma visits on Sundays.”"
                  className="min-w-56 flex-1"
                  maxLength={300}
                  aria-label="New memory"
                />
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Switch checked={draftPinned} onCheckedChange={setDraftPinned} aria-label="Pin new memory" /> Pin
                </label>
                <Button onClick={add} disabled={m.add.isPending || draft.trim().length < 4} className="gap-1.5">
                  {m.add.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />} Remember
                </Button>
              </div>

              {data.memories.length === 0 ? (
                <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                  Nothing remembered yet. Chat with Eir — “my name is Alex”, “I&apos;m allergic to penicillin”, “my doctor
                  told me to cut salt” — and she will hold on to it automatically.
                </p>
              ) : (
                <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                  {data.memories.map((mem) => {
                    const meta = TIER_META[mem.tier] ?? TIER_META.semantic
                    return (
                      <div key={mem.id} className="group flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm leading-relaxed">{mem.content}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                            <Badge variant="outline" className={`${meta.badge} px-1.5 py-0 text-[10px]`} title={meta.hint}>{meta.label}</Badge>
                            <span className="capitalize">{mem.kind}</span>
                            <span>· recalled {mem.accessCount}×</span>
                            {mem.expiresAt && <span>· fades {new Date(mem.expiresAt).toLocaleDateString()}</span>}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => m.togglePin.mutate({ id: mem.id, pinned: !mem.pinned })}
                            aria-label={mem.pinned ? 'Unpin memory' : 'Pin memory'} title={mem.pinned ? 'Unpin (moves to Learned)' : 'Pin to Core'}>
                            {mem.pinned ? <Pin className="h-3.5 w-3.5 text-primary" aria-hidden /> : <PinOff className="h-3.5 w-3.5" aria-hidden />}
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => m.remove.mutate(mem.id)} aria-label="Forget" title="Forget">
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><MoonStar className="h-4 w-4 text-primary" aria-hidden /> Nightly reflection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            After 21:00, while the app is open, Eir reviews the day — your conversation, readings, doses and journal —
            and writes one honest sentence into her memory. Over weeks this becomes the long view that makes her
            advice feel like it comes from someone who was there.
          </p>
          {data && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium">Run automatically</div>
                <Switch checked={data.config.autoReflect} onCheckedChange={(v) => m.setAutoReflect.mutate(v)} aria-label="Run nightly reflection automatically" />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" className="gap-2" onClick={() => m.reflect.mutate(false)} disabled={m.reflect.isPending}>
                  {m.reflect.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <MoonStar className="h-4 w-4" aria-hidden />}
                  Reflect on today
                </Button>
                <Button variant="ghost" className="gap-2 text-muted-foreground" onClick={() => m.reflect.mutate(true)} disabled={m.reflect.isPending}>
                  <Sparkles className="h-4 w-4" aria-hidden /> Re-run & overwrite
                </Button>
                <span className="text-xs text-muted-foreground">
                  {data.lastReflection ? `Last reflection: ${data.lastReflection}` : 'Never reflected yet'}
                </span>
              </div>
              {data.memories.filter((mem) => mem.kind === 'reflection').slice(0, 1).map((mem) => (
                <div key={mem.id} className="rounded-lg border bg-muted/20 p-3 text-sm italic leading-relaxed">
                  “{mem.content.replace(/^Nightly reflection [\d-]+:\s*/i, '')}”
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
