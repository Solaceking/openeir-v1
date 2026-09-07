'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ShieldCheck, CheckCircle2, XCircle, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { OpenEirLogo } from '@/components/logo'
import { Button } from '@/components/ui/button'

export default function CompanionAcceptPage({ params }: { params: Promise<{ token: string }> }) {
  const [state, setState] = useState<'working' | 'done' | 'error'>('working')
  const [message, setMessage] = useState('')
  const [companionName, setCompanionName] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { token } = await params
      try {
        const res = await fetch('/api/companion/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        const json = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setMessage(json.error ?? 'Pairing failed')
          setState('error')
          return
        }
        localStorage.setItem('openeir_companion_viewer', json.viewerToken)
        setCompanionName(json.companionName)
        setState('done')
      } catch {
        if (!cancelled) {
          setMessage('Network error — open this link again')
          setState('error')
        }
      }
    })()
    return () => { cancelled = true }
  }, [params])

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-teal-50/60 to-background p-4 dark:from-teal-950/20">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md rounded-3xl border bg-card p-8 text-center shadow-xl shadow-black/5">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-lg ring-1 ring-black/5 dark:ring-white/10">
          <OpenEirLogo className="h-12 w-12" aria-hidden />
        </div>

        {state === 'working' && (
          <>
            <h1 className="mt-5 text-xl font-bold">Pairing with OpenEir…</h1>
            <p className="mt-2 text-sm text-muted-foreground">Validating your one-time invite.</p>
          </>
        )}

        {state === 'done' && (
          <>
            <div className="mx-auto mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <CheckCircle2 className="h-7 w-7" aria-hidden />
            </div>
            <h1 className="mt-4 text-xl font-bold">You&apos;re paired{companionName ? `, ${companionName}` : ''}</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
              From this device you can now check on them anytime — their daily check-in, today&apos;s medications
              and latest readings. If they ever trigger SOS, you&apos;ll see it here instantly. They can revoke
              this access at any moment.
            </p>
            <div className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-primary/5 px-4 py-3 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              This device is now trusted. Keep the link private.
            </div>
            <Button asChild className="mt-5 w-full gap-2">
              <Link href="/companion/view">Open their status <ArrowRight className="h-4 w-4" aria-hidden /></Link>
            </Button>
          </>
        )}

        {state === 'error' && (
          <>
            <div className="mx-auto mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">
              <XCircle className="h-7 w-7" aria-hidden />
            </div>
            <h1 className="mt-4 text-xl font-bold">This invite didn&apos;t work</h1>
            <p className="mt-2 text-sm text-muted-foreground">{message}. Invites are single-use — ask for a fresh one.</p>
          </>
        )}
      </motion.div>
    </main>
  )
}
