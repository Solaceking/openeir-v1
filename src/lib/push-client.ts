// OpenEir — client-side Web Push plumbing: SW registration, permission flow,
// subscription lifecycle. Kept dependency-free on purpose.

'use client'

export interface PushState {
  supported: boolean
  permission: NotificationPermission | 'unsupported'
  subscribed: boolean
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export function pushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

async function serviceWorkerReady(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  return reg
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration()
  return reg ? reg.pushManager.getSubscription() : null
}

/** Current permission + whether this browser already holds a subscription. */
export async function readPushState(): Promise<PushState> {
  if (!pushSupported()) return { supported: false, permission: 'unsupported', subscribed: false }
  const sub = await currentSubscription().catch(() => null)
  return {
    supported: true,
    permission: Notification.permission,
    subscribed: !!sub,
  }
}

/**
 * Subscribe this browser to push. Requests permission if needed.
 * Throws with a readable message on refusal or server error.
 */
export async function subscribeToPush(label: string): Promise<PushState> {
  if (!pushSupported()) throw new Error('This browser does not support push notifications')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notification permission was not granted')
  const reg = await serviceWorkerReady()
  const keyRes = await fetch('/api/push')
  if (!keyRes.ok) throw new Error('Could not load the server push key')
  const { publicKey } = await keyRes.json() as { publicKey: string }
  const existing = await reg.pushManager.getSubscription()
  const sub = existing ?? await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
  })
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  const res = await fetch('/api/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, label }),
  })
  if (!res.ok) throw new Error('The server rejected the subscription')
  return { supported: true, permission: 'granted', subscribed: true }
}

/** Remove this browser's subscription both locally and server-side. */
export async function unsubscribeFromPush(): Promise<PushState> {
  const sub = await currentSubscription().catch(() => null)
  if (sub) {
    const endpoint = sub.endpoint
    await sub.unsubscribe().catch(() => {})
    await fetch('/api/push', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    }).catch(() => {})
  }
  return { supported: pushSupported(), permission: pushSupported() ? Notification.permission : 'unsupported', subscribed: false }
}

/** Ask the server to ping every subscribed device. */
export async function sendTestPush(label = 'Test'): Promise<{ sent: number; failed: number; pruned: number }> {
  const res = await fetch('/api/push', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label }),
  })
  if (!res.ok) throw new Error('Test push failed on the server')
  return res.json()
}
