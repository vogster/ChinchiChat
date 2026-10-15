/**
 * Registers the service worker (public/sw.js) that makes the app installable. Only in
 * production builds: in development it would serve stale modules.
 */
export const registerServiceWorker = (production: boolean = import.meta.env.PROD) => {
  if (!production || !('serviceWorker' in navigator)) return
  window.addEventListener(
    'load',
    () => {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined)
    },
    { once: true },
  )
}
