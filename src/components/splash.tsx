'use client'

// OpenEir — splash screen. Cream paper, Eir's portrait in a flat ring, serif
// wordmark, one thin teal progress line. Shown while the profile hydrates.

import { useEffect, useState } from 'react'
import Image from 'next/image'

const HINTS = [
  'Preparing your health companion…',
  'Waking Eir…',
  'Reading your latest vitals…',
]

export function Splash() {
  const [hint, setHint] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => setHint((h) => (h + 1) % HINTS.length), 2600)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background" role="status" aria-label="OpenEir is starting">
      {/* faint heritage frame — two hairlines, flat */}
      <div className="pointer-events-none absolute inset-x-6 inset-y-5 rounded-2xl border border-border/60 sm:inset-x-10 sm:inset-y-7" aria-hidden />

      <div className="eir-splash-logo relative">
        <div className="h-28 w-28 overflow-hidden rounded-full border border-primary/25 bg-card">
          <Image src="/mascot/eir-256.png" alt="Eir" width={112} height={112} priority className="h-full w-full object-cover" />
        </div>
        <span className="absolute inset-0 rounded-full ring-1 ring-inset ring-primary/10" aria-hidden />
      </div>

      <div className="eir-splash-word mt-7 text-center">
        <h1 className="font-display text-4xl font-medium tracking-tight text-foreground">OpenEir</h1>
        <p className="mt-1 font-display text-sm italic text-muted-foreground">Your health, understood.</p>
      </div>

      {/* one hairline track + sliding teal mark */}
      <div className="eir-splash-tag mt-10 w-44">
        <div className="h-0.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="eir-splash-bar h-full w-1/4 rounded-full bg-primary" />
        </div>
        <p className="mt-3 h-4 text-center text-[11px] text-muted-foreground transition-opacity" aria-live="polite">
          {HINTS[hint]}
        </p>
      </div>
    </div>
  )
}

