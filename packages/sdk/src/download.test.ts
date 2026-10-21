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
})
