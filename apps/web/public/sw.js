/* global self, caches */
// Chinchi service worker: makes the app installable and lets it open without a network.
// It caches only the app itself: never the API, the gateway or anything on other origins,
// so messages and files always come fresh from the server.
const VERSION = 'v1'
const SHELL = `chinchi-shell-${VERSION}`
const ASSETS = `chinchi-assets-${VERSION}`
const ASSET_LIMIT = 200

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(['/'])))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith('chinchi-') && name !== SHELL && name !== ASSETS)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

/** Pages: the network first (always the newest app), the saved shell when offline. */
const page = async (request) => {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(SHELL)
      await cache.put('/', response.clone())
    }
    return response
  } catch (error) {
    const shell = await caches.match('/')
    if (shell) return shell
    throw error
  }
}

/** Hashed build assets never change: the first copy is kept (up to a limit). */
const asset = async (request) => {
  const cache = await caches.open(ASSETS)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) {
    await cache.put(request, response.clone())
    const keys = await cache.keys()
    for (const key of keys.slice(0, Math.max(0, keys.length - ASSET_LIMIT))) await cache.delete(key)
  }
  return response
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname === '/health') return
  if (request.mode === 'navigate') event.respondWith(page(request))
  else if (url.pathname.startsWith('/assets/')) event.respondWith(asset(request))
})
