'use client'

// OpenEir — Settings → Providers → Chat: the conversation knobs.
// Persona (preset or custom), verbosity, and the sampling temperature.
// Defaults reproduce v3.4 exactly: companion persona, balanced, 0.6.
// Safety lines are server-side and can never be overridden here.

import { useEffect, useState } from 'react'
import { Loader2, MessagesSquare, Thermometer, UserRoundPen, Save } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { useUI } from '@/lib/store'

interface ChatConfigView {
  personaPreset: 'companion' | 'clinician' | 'coach' | 'custom'
  personaCustom: string
  verbosity: 'short' | 'balanced' | 'detailed'
  temperature: number
}

const DEFAULTS: ChatConfigView = { personaPreset: 'companion', personaCustom: '', verbosity: 'balanced', temperature: 0.6 }

const PERSONAS: { value: ChatConfigView['personaPreset']; label: string; blurb: string }[] = [
  { value: 'companion', label: 'Companion', blurb: 'Warm, steady friend — today\'s default. Celebrates wins, keeps it human.' },
  { value: 'clinician', label: 'Clinician', blurb: 'Precise and factual: numbers first, units, flags out-of-range values, no small talk.' },
  { value: 'coach', label: 'Coach', blurb: 'Encouraging health coach: one concrete next step per reply, momentum-focused.' },
  { value: 'custom', label: 'Custom', blurb: 'Your own instructions — applied inside Eir\'s safety rules, never above them.' },
]

const VERBOSITY: { value: ChatConfigView['verbosity']; label: string; blurb: string }[] = [
  { value: 'short', label: 'Short', blurb: 'One or two sentences, under ~60 words.' },
  { value: 'balanced', label: 'Balanced', blurb: 'Up to ~110 words unless you ask for depth — today\'s default.' },
  { value: 'detailed', label: 'Detailed', blurb: 'Thorough explanations, ~150–300 words, context and next steps.' },
]

export function ChatPrefsSection() {
  const simpleMode = useUI((s) => s.simpleMode)
  const [cfg, setCfg] = useState<ChatConfigView>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/chat-config')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { config?: ChatConfigView } | null) => { if (alive && d?.config) setCfg(d.config) })
      .catch(() => { /* defaults stay */ })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const r = await fetch('/api/chat-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Save failed')
      toast.success('Chat behavior saved', { description: 'Eir answers with the new style from the next message on.' })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const persona = PERSONAS.find((p) => p.value === cfg.personaPreset) ?? PERSONAS[0]

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="flex items-center gap-2">
          <MessagesSquare className="h-4 w-4 text-primary" aria-hidden />
          <span className="text-sm font-semibold">Chat behavior — how Eir answers</span>
        </div>
        {loading && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> loading…</div>}

        {/* ---- Persona ---- */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm"><UserRoundPen className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> Persona</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {PERSONAS.map((p) => {
              const active = cfg.personaPreset === p.value
              return (
                <button
                  key={p.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCfg({ ...cfg, personaPreset: p.value })}
                  className={`rounded-xl border p-3 text-left transition-colors ${active ? 'border-primary bg-primary/5' : 'border-border/70 hover:bg-accent/50'}`}
                >
                  <span className="text-sm font-medium">{p.label}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{p.blurb}</span>
                </button>
              )
            })}
          </div>
          {cfg.personaPreset === 'custom' && (
            <div>
              <Label htmlFor="chat-persona" className="text-xs text-muted-foreground">Custom instructions for Eir</Label>
              <textarea
                id="chat-persona"
                value={cfg.personaCustom}
                maxLength={2000}
                onChange={(e) => setCfg({ ...cfg, personaCustom: e.target.value })}
                rows={4}
                placeholder="e.g. Speak plainly, use kilometres and millimetres, mention my walking routine when relevant, never call me 'buddy'."
                className="mt-1.5 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-primary"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Applied after Eir&apos;s fixed safety identity — a custom persona can add tone, but can never remove the medical guardrails.
              </p>
            </div>
          )}
          {cfg.personaPreset !== 'custom' && (
            <p className="text-[11px] text-muted-foreground">{persona.blurb}</p>
          )}
        </div>

        {/* ---- Verbosity ---- */}
        <div className="space-y-2">
          <Label className="text-sm">Reply length</Label>
          <Select value={cfg.verbosity} onValueChange={(v) => setCfg({ ...cfg, verbosity: v as ChatConfigView['verbosity'] })}>
            <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {VERBOSITY.map((v) => (
                <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">{VERBOSITY.find((v) => v.value === cfg.verbosity)?.blurb}</p>
        </div>

        {/* ---- Temperature ---- */}
        {!simpleMode && (
          <div>
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5 text-sm"><Thermometer className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> Creativity (temperature)</Label>
              <span className="text-xs tabular-nums text-muted-foreground">{cfg.temperature.toFixed(2)}</span>
            </div>
            <Slider
              value={[cfg.temperature]}
              min={0}
              max={1}
              step={0.05}
              onValueChange={(v) => setCfg({ ...cfg, temperature: v[0] })}
              className="mt-2 max-w-sm"
              aria-label="Temperature"
            />
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>0 · precise</span>
              <span>0.6 · default</span>
              <span>1 · inventive</span>
            </div>
            {cfg.temperature > 0.9 && (
              <p className="mt-1.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                High temperature on health answers can drift from the facts — anything above 0.9 is yours to own.
              </p>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-border/60 pt-4">
          <Button onClick={save} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Save className="h-3.5 w-3.5" aria-hidden />}
            {saving ? 'Saving…' : 'Save chat behavior'}
          </Button>
          <span className="text-[11px] text-muted-foreground">Applies to every device using this instance.</span>
        </div>
      </CardContent>
    </Card>
  )
}
