'use client'

import { memo } from 'react'
import { motion } from 'framer-motion'
import { Check, CheckCheck, Mic } from 'lucide-react'
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 480, damping: 34, mass: 0.7 }}
      className={`flex w-full gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {!isUser && (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500/20 to-teal-500/5 ring-1 ring-teal-500/25" aria-hidden>
          <OpenEirLogo className="h-5 w-5" />
        </div>
      )}
      <div className={`max-w-[85%] sm:max-w-[75%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        <div
          className={
            isUser
              ? 'eir-bubble-user rounded-2xl rounded-br-md px-3.5 py-2.5 text-[13.5px] leading-relaxed text-white shadow-sm'
              : 'eir-bubble-eir rounded-2xl rounded-bl-md px-3.5 py-2.5 text-[13.5px] leading-relaxed shadow-sm'
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
            : m.status === 'sent' ? <CheckCheck className="h-3 w-3 text-teal-600 dark:text-teal-400" aria-label={t('talk.delivered')} />
            : <span className="font-medium text-destructive">{t('talk.failed')}</span>
          )}
          {!isUser && m.provider?.label && (
            <span className="hidden sm:inline opacity-70">· {m.provider.label}{m.provider.model ? ` · ${m.provider.model}` : ''}</span>
          )}
        </div>
      </div>
    </motion.div>
  )
})
