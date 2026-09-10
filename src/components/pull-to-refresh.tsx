'use client'

// OpenEir — pull-to-refresh for mobile surfaces (Home, Trends, Readings).
// Touch-only by design: on coarse pointers, dragging down from the top of
// the scroll area stretches a spring indicator; release past the threshold
// and the view refetches with a weighted settle. Desktop (fine pointers)
// never engages. The browser's own overscroll/PTR is contained via CSS on
// the scroll area so this component owns the gesture.

import * as React from 'react'
import {
  motion, useMotionValue, useTransform, animate, useReducedMotion,
} from 'framer-motion'
import { Check, RefreshCw } from 'lucide-react'
import { hapticLight, hapticSuccess } from '@/lib/haptics'

const THRESHOLD = 64
const MAX_PULL = 96
const DAMPING = 0.5 // rubber-band: rendered = damped(touch delta)

type Phase = 'idle' | 'pulling' | 'refreshing' | 'done'

export function PullToRefresh({
  onRefresh, children,
}: {
  onRefresh: () => Promise<unknown> | unknown
  children: React.ReactNode
}) {
  const wrapRef = React.useRef<HTMLDivElement>(null)
  const startY = React.useRef<number | null>(null)
  const armed = React.useRef(false) // past threshold at release
  const refreshing = React.useRef(false)
  const [phase, setPhase] = React.useState<Phase>('idle')
  const reduced = useReducedMotion()

  const pull = useMotionValue(0)
  const y = useTransform(pull, (v) => v * 0.55) // content follows with slack
  const indY = useTransform(pull, (v) => v - 34)
  const indOpacity = useTransform(pull, [10, 44], [0, 1])
  const spin = useTransform(pull, [0, THRESHOLD], [0, 300])

  React.useEffect(() => {
    const el = wrapRef.current
    if (!el || reduced) return
    if (typeof window === 'undefined') return
    if (!window.matchMedia('(pointer: coarse)').matches) return

    /** nearest scrollable ancestor (the shell's <main>) */
    const scrollTopOf = (node: Node | null): number => {
      let n = node as HTMLElement | null
      while (n && n !== document.body) {
        if (n.scrollTop > 0) return n.scrollTop
        const { overflowY } = getComputedStyle(n)
        if (overflowY === 'auto' || overflowY === 'scroll') return n.scrollTop
        n = n.parentElement
      }
      return 0
    }

    const onStart = (e: TouchEvent) => {
      if (refreshing.current) return
      if (e.touches.length !== 1) return
      if (scrollTopOf(e.target as Node | null) > 0) return
      startY.current = e.touches[0].clientY
    }

    const onMove = (e: TouchEvent) => {
      if (startY.current === null || refreshing.current) return
      const dy = e.touches[0].clientY - startY.current
      if (dy <= 0) {
        pull.set(0)
        armed.current = false
        setPhase('idle')
        return
      }
      // only claim the gesture once it's clearly a pull from the top
      const damped = Math.min((1 - 1 / ((dy * DAMPING) / MAX_PULL + 1)) * MAX_PULL, MAX_PULL)
      if (damped > 6) e.preventDefault() // needs the non-passive listener below
      pull.set(damped)
      const nowArmed = damped >= THRESHOLD
      if (nowArmed !== armed.current) {
        armed.current = nowArmed
        hapticLight()
        setPhase('pulling')
      }
    }

    const onEnd = () => {
      if (startY.current === null) return
      startY.current = null
      if (armed.current && !refreshing.current) {
        refreshing.current = true
        setPhase('refreshing')
        animate(pull, THRESHOLD * 0.72, { type: 'spring', stiffness: 420, damping: 34 })
        Promise.resolve(onRefresh())
          .catch(() => {})
          .then(() => {
            setPhase('done')
            hapticSuccess()
            animate(pull, 0, { type: 'spring', stiffness: 320, damping: 30, delay: 0.35 })
            setTimeout(() => { setPhase('idle'); refreshing.current = false; armed.current = false }, 900)
          })
      } else {
        animate(pull, 0, { type: 'spring', stiffness: 420, damping: 36 })
      }
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [onRefresh, pull, reduced])

  return (
    <div ref={wrapRef} className="relative">
      {/* stretch indicator */}
      <motion.div
        style={{ y: indY, opacity: indOpacity }}
        className="pointer-events-none absolute inset-x-0 -top-2 z-10 flex justify-center"
        aria-hidden
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-card text-primary shadow-[var(--shadow-eir-card)]">
          {phase === 'done' ? (
            <Check className="h-4.5 w-4.5" aria-hidden />
          ) : phase === 'refreshing' ? (
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, ease: 'linear', duration: 0.9 }}
              className="flex"
            >
              <RefreshCw className="h-4.5 w-4.5" aria-hidden />
            </motion.span>
          ) : (
            <motion.span style={{ rotate: spin }} className="flex">
              <RefreshCw className="h-4.5 w-4.5" aria-hidden />
            </motion.span>
          )}
        </span>
      </motion.div>
      {/* content rides the pull */}
      <motion.div style={{ y }}>
        {children}
      </motion.div>
    </div>
  )
}
