import { describe, expect, it, vi } from 'vitest'

import { createDownload } from './download'
import { ApiError } from './errors'

import type { FetchLike } from './http'

const okFetch = () =>
  vi.fn<FetchLike>(async () => new Response(new Blob(['bytes'], { type: 'image/png' })))

describe('createDownload', () => {
  it('carries the token to the server the API lives on (native clients)', async () => {
    const fetch = okFetch()
    const download = createDownload({
      baseUrl: 'https://chat.example.com/api/v1',
      fetch,
      getToken: () => 'secret',
    })

    const blob = await download('/api/v1/attachments/1/cat.png')

    expect(blob.type).toBe('image/png')
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://chat.example.com/api/v1/attachments/1/cat.png')
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer secret')
    expect(new Headers(init.headers).get('x-auth-mode')).toBe('bearer')
    expect(init.credentials).toBe('omit')
  })

  it('relies on the cookie in a browser tab and leaves absolute addresses alone', async () => {
    const fetch = okFetch()
    const download = createDownload({ baseUrl: '/api/v1', fetch })

    await download('/api/v1/attachments/1/cat.png')
    await download('https://files.example.com/x.png')

    const calls = fetch.mock.calls as [string, RequestInit][]
    const [first, init] = calls[0] as [string, RequestInit]
    const [second] = calls[1] as [string, RequestInit]
    expect(first).toBe('/api/v1/attachments/1/cat.png')
    expect(init.credentials).toBe('include')
    expect(new Headers(init.headers).has('authorization')).toBe(false)
    expect(second).toBe('https://files.example.com/x.png')
  })

  it('turns failures into ApiError', async () => {
    const missing = createDownload({
      baseUrl: '/api/v1',
      fetch: async () => new Response(null, { status: 404, statusText: 'Not Found' }),
    })
    await expect(missing('/api/v1/attachments/1/x')).rejects.toMatchObject({
      status: 404,
      code: 'HTTP_404',
    })

    const offline = createDownload({
      baseUrl: '/api/v1',
      fetch: async () => {
        throw new TypeError('offline')
      },
    })
    const error = await offline('/api/v1/attachments/1/x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('NETWORK_ERROR')
  })

  it('reports the bytes as they arrive, out of the length the server gave', async () => {
    const download = createDownload({
      baseUrl: '/api/v1',
      fetch: async () =>
        new Response(chunked([Uint8Array.of(1, 2, 3), Uint8Array.of(4, 5)]), {
          headers: { 'content-length': '5', 'content-type': 'application/octet-stream' },
        }),
    })
    const onProgress = vi.fn()

    const blob = await download('/api/v1/attachments/1/x', { onProgress })

    expect(onProgress.mock.calls).toEqual([
      [3, 5],
      [5, 5],
    ])
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(Uint8Array.of(1, 2, 3, 4, 5))
    expect(blob.type).toBe('application/octet-stream')
  })

  it('reports no total when the server does not say the length', async () => {
    const download = createDownload({
      baseUrl: '/api/v1',
      fetch: async () => new Response(chunked([Uint8Array.of(1, 2)])),
    })
    const onProgress = vi.fn()

    await download('/api/v1/attachments/1/x', { onProgress })

    expect(onProgress).toHaveBeenLastCalledWith(2, null)
  })

  it('stops when cancelled, with the abort rather than a network error', async () => {
    const controller = new AbortController()
    const fetch = vi.fn<FetchLike>(async (_url, init) => {
      expect(init.signal).toBe(controller.signal)
      controller.abort()
      throw new DOMException('The operation was aborted.', 'AbortError')
    })
    const download = createDownload({ baseUrl: '/api/v1', fetch })

    const error = await download('/api/v1/attachments/1/x', { signal: controller.signal }).catch(
      (e: unknown) => e,
    )

    expect(error).not.toBeInstanceOf(ApiError)
    expect((error as DOMException).name).toBe('AbortError')
  })

  it('stops reading the body when cancelled midway, even if the server stalls', async () => {
    const controller = new AbortController()
    const stalled = new ReadableStream<Uint8Array>({
      start: (body) => body.enqueue(Uint8Array.of(1)),
    })
    const download = createDownload({
      baseUrl: '/api/v1',
      fetch: async () => new Response(stalled),
    })

    const error = await download('/api/v1/attachments/1/x', {
      signal: controller.signal,
      onProgress: () => setTimeout(() => controller.abort()),
    }).catch((e: unknown) => e)

    expect((error as DOMException).name).toBe('AbortError')
  })

  it('turns a body that breaks off into a network error', async () => {
    const download = createDownload({
      baseUrl: '/api/v1',
      fetch: async () =>
        new Response(
          new ReadableStream({
            start: (body) => body.error(new TypeError('connection reset')),
          }),
          { headers: { 'content-length': 'many' } },
        ),
    })

    const error = await download('/api/v1/attachments/1/x', { onProgress: () => {} }).catch(
      (e: unknown) => e,
    )

    expect((error as ApiError).code).toBe('NETWORK_ERROR')
  })
})

/** A body that arrives in these pieces. */
const chunked = (chunks: readonly Uint8Array[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk))
      controller.close()
    },
  })
