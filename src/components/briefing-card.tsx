// OpenEir — Morning Briefing card on the Dashboard.
// Reads today's deterministic briefing, plays it through the same Edge TTS
// voice as the Talk tab, and can push it to every subscribed device.

'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sun, Volume2, Square, BellPlus, ChevronDown, Activity, Droplets,
  Pill, Flame, AlertTriangle, Target, Gauge, Loader2,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useBriefing, useDeliverBriefing, type BriefingSection } from '@/lib/api-client'
import { speak, stopSpeaking } from '@/lib/voice/tts'

const SECTION_ICONS: Record<BriefingSection['icon'], typeof Activity> = {
  score: Gauge, bp: Activity, glucose: Droplets, meds: Pill,
  streak: Flame, warning: AlertTriangle, focus: Target,
}

export function BriefingCard() {
  const briefing = useBriefing()
  const deliver = useDeliverBriefing()
  const [expanded, setExpanded] = useState(false)
  const [speaking, setSpeaking] = useState(false)

  useEffect(() => () => { if (speaking) stopSpeaking() }, [speaking])

  if (briefing.isLoading || briefing.isError || !briefing.data) return null
  const { briefing: b, deliveredToday, config } = briefing.data
  if (!config.enabled) return null

  const listen = () => {
    if (speaking) {
      stopSpeaking()
      setSpeaking(false)
      return
    }
    setSpeaking(true)
    speak(b.spoken, { onEnd: () => setSpeaking(false), onError: () => setSpeaking(false) })
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-primary/[0.04] via-transparent to-amber-500/[0.05]">
        <CardContent className="p-0">
          <div className="flex items-start gap-3 p-4 sm:p-5">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Sun className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-base font-semibold sm:text-lg">Morning briefing</h2>
                <Badge variant="secondary" className="numeric">{b.headline}</Badge>
                {deliveredToday && <Badge variant="outline" className="text-[10px] uppercase tracking-wide">delivered</Badge>}
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {b.sections[0]?.text ?? 'Your snapshot is ready.'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button size="icon" variant={speaking ? 'default' : 'outline'} className="h-9 w-9" onClick={listen} aria-label={speaking ? 'Stop briefing' : 'Listen to briefing'} title={speaking ? 'Stop' : 'Listen'}>
                {speaking ? <Square className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
              </Button>
              <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => deliver.mutate()} disabled={deliver.isPending} aria-label="Send briefing to my devices" title="Push to my devices">
                {deliver.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <BellPlus className="h-4 w-4" aria-hidden />}
              </Button>
              <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} aria-label={expanded ? 'Collapse briefing' : 'Expand briefing'}>
                <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden />
              </Button>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="space-y-3 border-t px-4 pb-4 pt-3 sm:px-5">
                  {b.sections.map((s, i) => {
                    const Icon = SECTION_ICONS[s.icon] ?? Gauge
                    return (
                      <div key={i} className="flex gap-2.5">
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" aria-hidden />
                        <div>
                          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{s.label}</p>
                          <p className="text-sm leading-relaxed">{s.text}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  )
}
