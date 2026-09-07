'use client'

import { useEffect, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import { OrbEngine, type OrbState } from '@/lib/voice/orb-engine'

/** WebGL orb with graceful CSS fallback when WebGL is unavailable. */
export function OrbCanvas({
  state,
  levelRef,
  ampRef,
  size = 300,
  className = '',
  forceDark = false,
}: {
  state: OrbState
  levelRef: React.RefObject<number>
  ampRef: React.RefObject<number>
  size?: number
  className?: string
  /** the immersive voice scene is always deep-space, regardless of app theme */
  forceDark?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<OrbEngine | null>(null)
  const [webgl, setWebgl] = useState(true)
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const engine = new OrbEngine()
    const ok = engine.attach(canvas)
    engineRef.current = engine
    setWebgl(ok)
    if (!ok) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    engine.setReducedMotion(reduced)
    return () => { engine.destroy(); engineRef.current = null }
  }, [])

  useEffect(() => { engineRef.current?.setState(state) }, [state])
  useEffect(() => { engineRef.current?.setTheme(forceDark || resolvedTheme === 'dark') }, [resolvedTheme, forceDark])

  // feed the orb real signals at display rate
  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      engineRef.current?.setLevel(levelRef.current ?? 0)
      engineRef.current?.setAmp(ampRef.current ?? 0)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [levelRef, ampRef])

  if (!webgl) {
    // CSS smoke fallback — soft rising mist, still state-reactive in color
    const tint =
      state === 'listening' ? 'bg-teal-300'
      : state === 'thinking' ? 'bg-violet-400'
      : state === 'speaking' ? 'bg-teal-200'
      : 'bg-teal-500'
    return (
      <div className={`relative items-center justify-center ${className}`} style={{ width: size, height: size }} aria-hidden>
        <div className={`absolute bottom-[8%] left-1/2 h-[46%] w-[58%] -translate-x-1/2 rounded-full ${tint} opacity-50 blur-2xl`} />
        <div className={`absolute bottom-[30%] left-[38%] h-[36%] w-[38%] rounded-full ${tint} opacity-35 blur-2xl animate-pulse`} />
        <div className={`absolute bottom-[48%] left-[54%] h-[28%] w-[26%] rounded-full ${tint} opacity-25 blur-xl animate-pulse`} style={{ animationDelay: '700ms' }} />
        <div className={`absolute bottom-[2%] left-1/2 h-[16%] w-[30%] -translate-x-1/2 rounded-full ${tint} opacity-70 blur-md`} />
      </div>
    )
  }

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: size, height: size }}
      aria-hidden
    />
  )
}
