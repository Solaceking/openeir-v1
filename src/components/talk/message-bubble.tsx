'use client'

import { memo, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, CheckCheck, Copy, Mic, Wrench, Send } from 'lucide-react'
import { OpenEirLogo } from '@/components/logo'
import { ActionCard, type ChatAction, type PendingSnapshot } from '@/components/talk/action-card'
import { useT } from '@/lib/i18n'

export interface ToolEventView {
  tool: string
  verb: 'read' | 'propose'
  latencyMs: number
  ok: boolean
}

export interface ChatBubbleMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  channel: 'text' | 'voice'
  createdAt: string
  status?: 'sending' | 'sent' | 'failed'
  detected?: ChatAction | null
  /** server-backed pending actions proposed by the agent (assistant only) */
  pending?: PendingSnapshot[] | null
  /** transparent tool use — what the agent checked or prepared (assistant only) */
  toolEvents?: ToolEventView[] | null
  provider?: { label: string; model?: string | null; latencyMs: number } | null
  /** length of content currently revealed by the typewriter (assistant only) */
  revealLen?: number
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function humanizeTool(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
}

/** The "is Eir thinking or DOING something?" strip — never a silent spinner. */
function ToolStrip({ events }: { events: ToolEventView[] }) {
  const { t } = useT()
  if (!events.length) return null
  return (
    <div className="mb-1 flex flex-wrap gap-1">
      {events.map((e, i) => (
        <span
          key={`${e.tool}-${i}`}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
            e.ok ? 'border-teal-500/25 bg-teal-500/5 text-teal-700 dark:text-teal-300' : 'border-destructive/30 bg-destructive/5 text-destructive'
          }`}
          title={`${e.tool} · ${e.latencyMs}ms`}
        >
          {e.verb === 'read'
            ? <Wrench className="h-2.5 w-2.5" aria-hidden />
            : <Send className="h-2.5 w-2.5" aria-hidden />}
          {t(`agent.tools.${e.tool}`, { defaultValue: humanizeTool(e.tool) })}
          <span className="tabular-nums opacity-60">{e.latencyMs}ms</span>
        </span>
      ))}
    </div>
  )
}

export const MessageBubble = memo(function MessageBubble({ m }: { m: ChatBubbleMessage }) {
  const { t } = useT()
  const isUser = m.role === 'user'
  const revealed = m.revealLen === undefined ? m.content.length : m.revealLen
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(m.content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch { /* clipboard unavailable — ignore */ }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 480, damping: 34, mass: 0.7 }}
      className={`group flex w-full gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {!isUser && <OpenEirLogo className="eir-breathe mt-1 h-8 w-8" />}
      <div className={`max-w-[85%] sm:max-w-[75%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        {!isUser && <ToolStrip events={m.toolEvents ?? []} />}
        <div
          className={
            isUser
              ? 'eir-bubble-user rounded-2xl rounded-br-md px-3.5 py-2.5 text-[13.5px] leading-relaxed'
              : 'eir-bubble-eir rounded-2xl rounded-bl-md px-3.5 py-2.5 text-[13.5px] leading-relaxed'
          }
        >
          {m.content.slice(0, revealed)}
          {!isUser && revealed < m.content.length && (
            <span className="eir-caret" aria-hidden />
          )}
        </div>
        {/* confirmation cards live with Eir's acknowledgement.
            Server-backed pending actions win (their status is authoritative);
            legacy detected actions (old messages) keep the inline flow. */}
        {!isUser && (m.pending?.length
          ? m.pending.map((p) => <ActionCard key={p.id} pending={p} id={`${m.id}:${p.id}`} />)
          : m.detected && <ActionCard action={m.detected} id={m.id} />
        )}
        <div className={`mt-1 flex items-center gap-1.5 px-1 text-[10px] text-muted-foreground/80 ${isUser ? 'flex-row-reverse' : ''}`}>
          <span suppressHydrationWarning>{fmtTime(m.createdAt)}</span>
          {m.channel === 'voice' && <Mic className="h-3 w-3" aria-label={t('talk.viaVoice')} />}
          {isUser && (
            m.status === 'sending' ? <Check className="h-3 w-3 opacity-60" aria-label={t('talk.sending')} />
            : m.status === 'sent' ? <CheckCheck className="h-3 w-3 text-primary" aria-label={t('talk.delivered')} />
            : <span className="font-medium text-destructive">{t('talk.failed')}</span>
          )}
          {!isUser && m.provider?.label && (
            <span className="hidden sm:inline opacity-70">· {m.provider.label}{m.provider.model ? ` · ${m.provider.model}` : ''}</span>
          )}
          {!isUser && revealed >= m.content.length && (
            <button
              onClick={() => void copy()}
              className="ml-0.5 rounded p-0.5 opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
              aria-label={t('talk.copy')}
            >
              {copied ? <Check className="h-3 w-3 text-primary" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
})
