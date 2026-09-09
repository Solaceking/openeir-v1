// OpenEir — outbound Web Push (VAPID). Self-hosted friendly: VAPID keys are
// generated on first use and stored in AppSetting, so no .env editing is ever
// required. Dead endpoints (404/410 from the push service) are pruned on send.
//
// Payload contract (JSON):
//   { title: string, body: string, tag?: string, url?: string, kind?: 'sos'|'nudge'|'briefing'|'test'|'info' }

import webpush from 'web-push'
import { db } from '@/lib/db'

export interface PushPayload {
  title: string
  body: string
  tag?: string
  url?: string
  kind?: 'sos' | 'nudge' | 'briefing' | 'test' | 'info'
}

interface VapidKeys {
  publicKey: string
  privateKey: string
}

const SETTING_KEY = 'push.vapid'

let cachedKeys: VapidKeys | null = null

/** Load (or lazily generate) the instance's VAPID keypair. */
export async function getVapidKeys(): Promise<VapidKeys> {
  if (cachedKeys) return cachedKeys
  const row = await db.appSetting.findUnique({ where: { key: SETTING_KEY } })
  if (row) {
    try {
      const parsed = JSON.parse(row.value) as VapidKeys
      if (parsed.publicKey && parsed.privateKey) {
        cachedKeys = parsed
        return parsed
      }
    } catch {
      /* fall through to regenerate */
    }
  }
  const generated = webpush.generateVAPIDKeys()
  const keys = { publicKey: generated.publicKey, privateKey: generated.privateKey }
  await db.appSetting.upsert({
    where: { key: SETTING_KEY },
    update: { value: JSON.stringify(keys) },
    create: { key: SETTING_KEY, value: JSON.stringify(keys) },
  })
  cachedKeys = keys
  return keys
}

/** The VAPID public key in the exact format the browser pushManager expects. */
export async function getPublicKeyForClient(): Promise<string> {
  const keys = await getVapidKeys()
  // web-push generates base64url — hand it straight through; the client helper
  // in push-client.ts converts it to the Uint8Array applicationServerKey.
  return keys.publicKey
}

export interface PushResult {
  sent: number
  failed: number
  pruned: number
  nativeSent: number
}

/** Send to every stored subscription. Never throws — failures are recorded. */
export async function sendPushToAll(payload: PushPayload): Promise<PushResult> {
  const result: PushResult = { sent: 0, failed: 0, pruned: 0, nativeSent: 0 }
  let keys: VapidKeys
  try {
    keys = await getVapidKeys()
    webpush.setVapidDetails('mailto:hello@openeir.local', keys.publicKey, keys.privateKey)
  } catch {
    return result
  }
  const subs = await db.pushSubscription.findMany()
  const body = JSON.stringify(payload)
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          { TTL: 3600, urgency: payload.kind === 'sos' ? 'high' : 'normal' },
        )
        result.sent++
        await db.pushSubscription.update({
          where: { id: sub.id },
          data: { lastSuccessAt: new Date(), lastErrorAt: null, lastError: null },
        }).catch(() => {})
      } catch (err) {
        const statusCode = typeof err === 'object' && err && 'statusCode' in err ? Number((err as { statusCode?: number }).statusCode) : 0
        const message = err instanceof Error ? err.message : String(err)
        // 404/410 = subscription gone; prune. Everything else: record and keep.
        if (statusCode === 404 || statusCode === 410) {
          await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
          result.pruned++
        } else {
          result.failed++
          await db.pushSubscription.update({
            where: { id: sub.id },
            data: { lastErrorAt: new Date(), lastError: message.slice(0, 300) },
          }).catch(() => {})
        }
      }
    }),
  )
  await fanOutUnifiedPush(payload, result)
  return result
}

/**
 * Fan the same payload out to native (UnifiedPush/ntfy) targets — the Android
 * app registers its distributor endpoint here. Body stays the JSON contract;
 * X-Title / X-Priority headers make the message look right if the user also
 * watches the topic with a plain ntfy client.
 */
async function fanOutUnifiedPush(payload: PushPayload, result: PushResult): Promise<void> {
  let targets: { id: string; endpoint: string }[]
  try {
    targets = await db.unifiedPushTarget.findMany({ select: { id: true, endpoint: true } })
  } catch {
    return // table not migrated yet — never block web push
  }
  if (!targets.length) return
  await Promise.all(
    targets.map(async (t) => {
      try {
        const res = await fetch(t.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Title': payload.title,
            'X-Priority': payload.kind === 'sos' ? 'urgent' : payload.kind === 'briefing' ? 'low' : 'default',
            'X-Tags': payload.kind === 'sos' ? 'rotating_light' : 'heartbeat',
          },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        result.nativeSent++
        await db.unifiedPushTarget.update({ where: { id: t.id }, data: { lastSuccessAt: new Date(), lastErrorAt: null, lastError: null } }).catch(() => {})
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        await db.unifiedPushTarget.update({
          where: { id: t.id },
          data: { lastErrorAt: new Date(), lastError: message.slice(0, 300) },
        }).catch(() => {})
      }
    }),
  )
}
