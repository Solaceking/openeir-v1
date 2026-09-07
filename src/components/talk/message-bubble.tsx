'use client'

import { memo, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, CheckCheck, Copy, Mic } from 'lucide-react'
import { OpenEirLogo } from '@/components/logo'
import { ActionCard, type ChatAction } from '@/components/talk/action-card'
import { useT } from '@/lib/i18n'

export interface ChatBubbleMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  channel: 'text' | 'voice'
  createdAt: string
  status?: 'sending' | 'sent' | 'failed'
  detected?: ChatAction | null
  provider?: { label: string; model?: string | null; latencyMs: number } | null
  /** length of content currently revealed by the typewriter (assistant only) */
  revealLen?: number
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
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
        {/* action card lives with Eir's acknowledgement */}
        {!isUser && m.detected && <ActionCard action={m.detected} id={m.id} />}
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
