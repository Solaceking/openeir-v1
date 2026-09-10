/* OpenEir service worker — offline-first shell, network-first data.
   Strategy:
   - App shell & static assets: stale-while-revalidate
   - Navigations: NETWORK-first (users get new builds immediately), cache/offline fallback
   - API GETs: network-first with cache fallback (last-known data offline)
   - POSTs are queued client-side (see src/lib/offline.ts) */
const VERSION = 'openeir-v7'
const SHELL = ['/', '/manifest.webmanifest', '/offline.html']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== location.origin) return

  // API: network first, fall back to last cached copy
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(VERSION).then((c) => c.put(request, copy))
          return res
        })
        .catch(() => caches.match(request).then((hit) => hit ?? new Response(JSON.stringify({ error: 'offline' }), { status: 503, headers: { 'Content-Type': 'application/json' } })))
    )
    return
  }

  // Navigations: network-first — a deployed update reaches users on their
  // next reload; the cached shell only serves when the network is gone.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(VERSION).then((c) => c.put(request, copy))
          return res
        })
        .catch(() => caches.match(request).then((hit) => hit ?? caches.match('/offline.html')))
    )
    return
  }

  // Static assets: stale-while-revalidate
  event.respondWith(
    caches.match(request).then((hit) => {
      const fetching = fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(VERSION).then((c) => c.put(request, copy))
          return res
        })
        .catch(() => (request.mode === 'navigate' ? caches.match('/offline.html') : undefined))
      return hit ?? fetching
    })
  )
})

// --- Web Push ---------------------------------------------------------------
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'OpenEir', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'OpenEir'
  const options = {
    body: data.body || '',
    tag: data.tag || 'openeir',
    renotify: true,
    requireInteraction: data.kind === 'sos',
    vibrate: data.kind === 'sos' ? [300, 120, 300, 120, 300] : [80],
    data: { url: data.url || '/', kind: data.kind || 'info' },
    badge: '/icons/icon-192.png',
    icon: '/icons/icon-192.png',
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus()
          if ('navigate' in client && client.url !== new URL(target, self.location.origin).href) {
            try { client.navigate(target) } catch { /* best effort */ }
          }
          return
        }
      }
      return self.clients.openWindow(target)
    })
  )
})
