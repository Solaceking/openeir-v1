// OpenEir — offline queue. Readings captured offline are queued in
// localStorage and flushed automatically when connectivity returns.
'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

export type QueuedReading =
  | { kind: 'bp'; payload: Record<string, unknown>; queuedAt: string }
  | { kind: 'glucose'; payload: Record<string, unknown>; queuedAt: string }
  | { kind: 'lifestyle'; payload: Record<string, unknown>; queuedAt: string }
  | { kind: 'medlog'; payload: Record<string, unknown>; queuedAt: string }

const KEY = 'openeir-offline-queue'

export function readQueue(): QueuedReading[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as QueuedReading[]
  } catch {
    return []
  }
}

function writeQueue(items: QueuedReading[]) {
  localStorage.setItem(KEY, JSON.stringify(items))
}

export function enqueue(item: Omit<QueuedReading, 'queuedAt'>) {
  const q = readQueue()
  q.push({ ...item, queuedAt: new Date().toISOString() } as QueuedReading)
  writeQueue(q)
  return q.length
}

export function queueLength(): number {
  return readQueue().length
}

const ENDPOINTS: Record<QueuedReading['kind'], string> = {
  bp: '/api/readings/bp',
  glucose: '/api/readings/glucose',
  lifestyle: '/api/lifestyle',
  medlog: '/api/medications/log',
}

/** Attempt to flush the queue. Safe to call repeatedly. */
export async function flushQueue(qc: ReturnType<typeof useQueryClient> | null): Promise<number> {
  const q = readQueue()
  if (!q.length) return 0
  const remaining: QueuedReading[] = []
  let flushed = 0
  for (const item of q) {
    try {
      const res = await fetch(ENDPOINTS[item.kind], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...item.payload, queuedAt: item.queuedAt }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      flushed++
    } catch {
      remaining.push(item)
    }
  }
  writeQueue(remaining)
  if (flushed > 0 && qc) {
    qc.invalidateQueries()
    toast.success(`Synced ${flushed} offline ${flushed === 1 ? 'entry' : 'entries'}`)
  }
  return flushed
}

/** Global hook: listens for connectivity changes and flushes. */
export function useOfflineSync() {
  const qc = useQueryClient()
  useEffect(() => {
    const goOnline = () => {
      void flushQueue(qc)
    }
    window.addEventListener('online', goOnline)
    void flushQueue(qc)
    return () => window.removeEventListener('online', goOnline)
  }, [qc])
}
