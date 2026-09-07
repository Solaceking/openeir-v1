'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Brain, TrendingUp, AlertTriangle, PartyPopper, Lightbulb, BookOpen, Bot, User, X, Pin, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useUpdateInsight, type InsightRow } from '@/lib/api-client'
import { useUI } from '@/lib/store'

const KIND_ICON: Record<string, typeof Brain> = {
  pattern: TrendingUp, anomaly: TrendingUp, warning: AlertTriangle,
  celebration: PartyPopper, tip: Lightbulb, summary: BookOpen,
  coach: Brain, correlation: TrendingUp, agent: Bot,
}

const SEVERITY_STYLE: Record<string, string> = {
  info: 'border-teal-200 bg-teal-50/60 dark:border-teal-900 dark:bg-teal-950/30',
  low: 'border-cyan-200 bg-cyan-50/60 dark:border-cyan-900 dark:bg-cyan-950/30',
  medium: 'border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30',
  high: 'border-orange-300 bg-orange-50/70 dark:border-orange-900 dark:bg-orange-950/30',
  critical: 'border-rose-300 bg-rose-50/70 dark:border-rose-900 dark:bg-rose-950/30',
}

const SEVERITY_BADGE: Record<string, string> = {
  info: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
  low: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  critical: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
}

export function InsightCard({ insight, compact = false }: { insight: InsightRow; compact?: boolean }) {
  const update = useUpdateInsight()
  const Icon = KIND_ICON[insight.kind] ?? Brain
  const isNew = insight.status === 'new'

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.25 }}
      className={`rounded-xl border p-4 ${SEVERITY_STYLE[insight.severity] ?? SEVERITY_STYLE.info} ${isNew ? 'shadow-sm' : ''}`}
      aria-label={`${insight.severity} insight: ${insight.title}`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 rounded-lg bg-background/70 p-1.5" aria-hidden>
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold leading-snug">{insight.title}</h3>
            {insight.severity !== 'info' && (
              <Badge className={`text-[10px] px-1.5 py-0 ${SEVERITY_BADGE[insight.severity] ?? ''}`} variant="outline">
                {insight.severity}
              </Badge>
            )}
            {insight.origin !== 'rule' && (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                {insight.origin === 'agent' ? <Bot className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
                {insight.origin === 'agent' ? 'agent' : 'Eir AI'}
              </span>
            )}
            {insight.pinned && <Pin className="h-3 w-3 text-muted-foreground" />}
          </div>
          {!compact && <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{insight.body}</p>}
          <div className="mt-1 text-[11px] text-muted-foreground/70">
            {new Date(insight.createdAt).toLocaleString()}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <Button
            variant="ghost" size="icon" className="h-7 w-7" aria-label="Dismiss insight"
            onClick={() => update.mutate({ id: insight.id, status: 'dismissed' })}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </motion.article>
  )
}

export function InsightFeed({ insights, limit = 6 }: { insights: InsightRow[]; limit?: number }) {
  const { simpleMode } = useUI()
  const shown = insights.slice(0, simpleMode ? 3 : limit)
  return (
    <div className="space-y-3" role="feed" aria-label="Health insights">
      <AnimatePresence mode="popLayout">
        {shown.map((i) => <InsightCard key={i.id} insight={i} />)}
      </AnimatePresence>
      {!shown.length && (
        <div className="flex items-center gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          <User className="h-4 w-4 shrink-0" aria-hidden />
          Eir is watching your data. Insights will appear here as patterns emerge.
        </div>
      )}
    </div>
  )
}
