/* OpenEir service worker — offline-first shell, network-first data.
   Strategy:
   - App shell & static assets: stale-while-revalidate
   - API GETs: network-first with cache fallback (last-known data offline)
   - Navigations: cached shell, then network
   - POSTs are queued client-side (see src/lib/offline.ts) */
const VERSION = 'openeir-v1'
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

  // Static & pages: stale-while-revalidate
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
