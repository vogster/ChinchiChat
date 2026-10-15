import { describe, expect, it, vi } from 'vitest'

import manifestText from '../../public/manifest.webmanifest?raw'
import workerSource from '../../public/sw.js?raw'

/** Files shipped in public/, by their URL path. */
const PUBLIC_FILES = new Set(
  Object.keys(import.meta.glob('../../public/*')).map((path) => path.replace('../../public', '')),
)
const ORIGIN = 'https://chat.example.com'

type Handler = (event: Record<string, unknown>) => void

/** Runs public/sw.js against an in-memory Cache Storage and a mocked network. */
const loadWorker = (network: (request: Request) => Promise<Response>) => {
  const stores = new Map<string, Map<string, Response>>()
  const open = async (name: string) => {
    const store = stores.get(name) ?? new Map<string, Response>()
    stores.set(name, store)
    return {
      match: async (key: Request | string) =>
        store.get(new URL(typeof key === 'string' ? key : key.url, ORIGIN).href)?.clone(),
      put: async (key: Request | string, response: Response) => {
        store.set(new URL(typeof key === 'string' ? key : key.url, ORIGIN).href, response)
      },
      keys: async () => [...store.keys()].map((url) => new Request(url)),
      delete: async (key: Request) => store.delete(key.url),
      addAll: async (urls: string[]) => {
        for (const url of urls) store.set(new URL(url, ORIGIN).href, new Response(url))
      },
    }
  }
  const caches = {
    open,
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async (key: string) => {
      for (const name of stores.keys()) {
        const found = await (await open(name)).match(key)
        if (found) return found
      }
      return undefined
    },
  }
  const handlers = new Map<string, Handler>()
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
  }
  const fetchMock = vi.fn(network)
  new Function('self', 'caches', 'fetch', workerSource)(self, caches, fetchMock)

  /** Dispatches a fetch; resolves with the worker's answer, or null if it let it through. */
  const request = async (url: string, init: RequestInit & { mode?: RequestMode } = {}) => {
    // Assigned in the handler's callback, which TypeScript cannot follow.
    let answer = null as Promise<Response> | null
    const { mode, ...rest } = init
    const req = new Request(new URL(url, ORIGIN), rest)
    // Request() refuses mode "navigate"; only the browser creates those.
    if (mode) Object.defineProperty(req, 'mode', { value: mode })
    handlers.get('fetch')?.({
      request: req,
      respondWith: (response: Promise<Response>) => {
        answer = response
      },
    })
    return answer
  }
  const lifecycle = async (type: string) => {
    let pending: Promise<unknown> = Promise.resolve()
    handlers.get(type)?.({ waitUntil: (promise: Promise<unknown>) => (pending = promise) })
    await pending
  }
  return { request, lifecycle, stores, fetchMock, caches }
}

describe('service worker', () => {
  it('never touches the API, the gateway or other sites', async () => {
    const worker = loadWorker(async () => new Response('net'))

    expect(await worker.request('/api/v1/users/@me')).toBeNull()
    expect(await worker.request('/api/v1/messages', { method: 'POST', body: '{}' })).toBeNull()
    expect(await worker.request('https://files.example.com/a.png')).toBeNull()
  })

  it('serves pages from the network, falling back to the saved shell offline', async () => {
    let online = true
    const worker = loadWorker(async () => {
      if (!online) throw new TypeError('offline')
      return new Response('<html>fresh</html>')
    })

    const fresh = await worker.request('/channels/1/2', { mode: 'navigate' })
    expect(await fresh?.text()).toBe('<html>fresh</html>')

    online = false
    const offline = await worker.request('/channels/1/3', { mode: 'navigate' })
    expect(await offline?.text()).toBe('<html>fresh</html>')
  })

  it('keeps hashed assets once fetched', async () => {
    const worker = loadWorker(async () => new Response('js'))

    await (await worker.request('/assets/index-abc.js'))?.text()
    await (await worker.request('/assets/index-abc.js'))?.text()

    expect(worker.fetchMock).toHaveBeenCalledTimes(1)
  })

  it('drops caches of older versions when it takes over', async () => {
    const worker = loadWorker(async () => new Response('x'))
    await worker.caches.open('chinchi-shell-v0')
    await worker.lifecycle('install')
    await worker.lifecycle('activate')

    expect(await worker.caches.keys()).not.toContain('chinchi-shell-v0')
  })
})

describe('web app manifest', () => {
  it('describes an installable app whose icons exist', () => {
    const manifest = JSON.parse(manifestText) as {
      name: string
      start_url: string
      display: string
      icons: { src: string; sizes: string; purpose?: string }[]
    }
    expect(manifest).toMatchObject({ name: 'Chinchi', start_url: '/', display: 'standalone' })
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual(
      expect.arrayContaining(['192x192', '512x512']),
    )
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true)
    for (const icon of manifest.icons) expect(PUBLIC_FILES).toContain(icon.src)
  })
})
