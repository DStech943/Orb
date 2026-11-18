const CACHE_NAME = __ORB_PWA_CACHE_NAME__
const PRECACHE_URLS = __ORB_PWA_PRECACHE_URLS__

const isSuccess = (response) => response && response.ok

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith('orb-pwa-') && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Live data must always use the network. In particular, never cache or
  // synthesize a response for API requests, uploads, or Chatspace WebSockets.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isSuccess(response)) {
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', response.clone()))
          }
          return response
        })
        .catch(async () => (await caches.match('/index.html')) || (await caches.match('/'))),
    )
    return
  }

  // Hashed Vite assets are immutable. Cache-first makes installed Orb launch
  // reliably offline, while a new service worker receives a fresh asset list
  // on the next deployment.
  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) return cached
      const response = await fetch(request)
      if (isSuccess(response)) {
        const cache = await caches.open(CACHE_NAME)
        cache.put(request, response.clone())
      }
      return response
    }),
  )
})
