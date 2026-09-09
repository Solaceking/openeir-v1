// OpenEir — event bus. Every notable action becomes an event; the
// orchestrator reacts. Events are persisted (audit + agent polling) and
// mirrored to the realtime service for ambient UI updates.

import { db } from '@/lib/db'
import { processEvent } from '@/lib/ai/orchestrator'

export type EventType =
  | 'READING_LOGGED'
  | 'MEDICATION_MISSED'
  | 'MEDICATION_TAKEN'
  | 'PATTERN_ANOMALY'
  | 'PATTERN_CHECK'
  | 'MILESTONE_REACHED'
  | 'ENGAGEMENT_DROP'
  | 'BLUETOOTH_SYNCED'
  | 'DOCTOR_VISIT_UPCOMING'
  | 'REPORT_VIEWED'
  | 'REPORT_EMAILED'
  | 'MANUAL_QUERY'
  | 'DEEP_ANALYSIS'

export type Priority = 'low' | 'normal' | 'high' | 'critical'

const REALTIME_URL = process.env.REALTIME_URL ?? 'http://127.0.0.1:3031'

/** Fire-and-forget publish to the socket.io realtime service (server-side only). */
export function publishRealtime(channel: string, payload: unknown) {
  fetch(`${REALTIME_URL}/emit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, payload }),
    signal: AbortSignal.timeout(1500),
  }).catch(() => {
    /* realtime service is optional — never let it break the API */
  })
}

export async function emitEvent(
  type: EventType,
  payload: Record<string, unknown> = {},
  priority: Priority = 'normal',
) {
  try {
    const record = await db.eventRecord.create({
      data: { type, priority, payload: JSON.stringify(payload) },
    })
    publishRealtime('event', { type, priority, at: record.createdAt })
    // Async processing — never block the caller's response on AI work.
    void processEvent(record.id).catch((e) =>
      console.error(`[orchestrator] failed handling ${type}:`, e instanceof Error ? e.message : e),
    )
    return record
  } catch (e) {
    console.error('[events] emit failed:', e)
    return null
  }
}
