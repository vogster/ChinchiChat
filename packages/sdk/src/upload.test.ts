import { describe, expect, it, vi } from 'vitest'

import { createApiClient } from './client'
import { ApiError } from './errors'
import { createXhrPut } from './upload'

const SLOT = {
  id: '11',
  uploadUrl: 'http://files.test/chinchi/uploads/3/11?X-Amz-Signature=x',
  method: 'PUT',
  headers: { 'Content-Type': 'image/png' },
  expiresAt: '2026-10-14T12:15:00.000Z',
}

const json = (data: unknown) =>
  new Response(JSON.stringify({ success: true, data }), {
    status: 201,
    headers: { 'content-type': 'application/json' },
  })

const file = new File([new Uint8Array([1, 2, 3])], 'cat.png', { type: 'image/png' })

describe('attachments.upload', () => {
  it('requests a slot for the file and puts the bytes to storage', async () => {
    const fetch = vi.fn(async (url: string) =>
      url.startsWith('/api') ? json({ attachment: SLOT }) : new Response(null, { status: 200 }),
    )
    const api = createApiClient({ baseUrl: '/api/v1', fetch })

    await expect(api.attachments.upload('3', file)).resolves.toBe('11')

    const [createUrl, createInit] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(createUrl).toBe('/api/v1/channels/3/attachments')
    expect(JSON.parse(createInit.body as string)).toEqual({
      filename: 'cat.png',
      size: 3,
      contentType: 'image/png',
    })
    const [putUrl, putInit] = fetch.mock.calls[1] as unknown as [string, RequestInit]
    expect(putUrl).toBe(SLOT.uploadUrl)
    expect(putInit).toMatchObject({
      method: 'PUT',
      headers: SLOT.headers,
      body: file,
      credentials: 'omit',
    })
  })

  it('lets the caller rename the file and leaves an unknown type to the server', async () => {
    const fetch = vi.fn(async (url: string) =>
      url.startsWith('/api') ? json({ attachment: SLOT }) : new Response(null, { status: 200 }),
    )
    const api = createApiClient({ baseUrl: '/api/v1', fetch })
    const blob = new Blob([new Uint8Array([1])])

    await api.attachments.upload('3', blob, { filename: 'data.bin' })

    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ filename: 'data.bin', size: 1 })
  })

  it('reports a rejected upload', async () => {
    const fetch = vi.fn(async (url: string) =>
      url.startsWith('/api') ? json({ attachment: SLOT }) : new Response(null, { status: 403 }),
    )
    const api = createApiClient({ baseUrl: '/api/v1', fetch })

    await expect(api.attachments.upload('3', file)).rejects.toEqual(
      new ApiError(403, 'UPLOAD_FAILED', 'File upload failed'),
    )
  })

  it('reports an unreachable storage as a network error', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.startsWith('/api')) return json({ attachment: SLOT })
      throw new TypeError('Failed to fetch')
    })
    const api = createApiClient({ baseUrl: '/api/v1', fetch })

    await expect(api.attachments.upload('3', file)).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
  })
})

describe('upload progress', () => {
  it('reports the whole file at once when it goes through fetch (no progress events)', async () => {
    const fetch = vi.fn(async (url: string) =>
      url.startsWith('/api') ? json({ attachment: SLOT }) : new Response(null, { status: 200 }),
    )
    const api = createApiClient({ baseUrl: '/api/v1', fetch })
    const onProgress = vi.fn()

    await api.attachments.upload('3', file, { onProgress })

    expect(onProgress.mock.calls).toEqual([[3, 3]])
  })

  /** Just enough of XMLHttpRequest: the test drives its events. */
  class FakeXhr {
    static last: FakeXhr | null = null
    readonly upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null }
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    status = 0
    opened: [string, string] | null = null
    headers: Record<string, string> = {}
    body: unknown = null
    withCredentials = true
    constructor() {
      FakeXhr.last = this
    }
    open(method: string, url: string) {
      this.opened = [method, url]
    }
    setRequestHeader(name: string, value: string) {
      this.headers[name] = value
    }
    send(body: unknown) {
      this.body = body
    }
    progress(loaded: number) {
      this.upload.onprogress?.({ lengthComputable: true, loaded, total: 3 } as ProgressEvent)
    }
    finish(status: number) {
      this.status = status
      this.onload?.()
    }
  }

  const slot = { ...SLOT, method: 'PUT' as const }

  it('streams progress events from XMLHttpRequest to storage', async () => {
    const put = createXhrPut(FakeXhr as unknown as typeof XMLHttpRequest)
    const onProgress = vi.fn()

    const done = put(slot, file, onProgress)
    const xhr = FakeXhr.last as FakeXhr
    expect(xhr.opened).toEqual(['PUT', SLOT.uploadUrl])
    expect(xhr.headers).toEqual(SLOT.headers)
    expect(xhr.withCredentials).toBe(false)
    expect(xhr.body).toBe(file)
    xhr.progress(1)
    xhr.progress(3)
    xhr.finish(200)

    await expect(done).resolves.toBeUndefined()
    expect(onProgress.mock.calls).toEqual([
      [1, 3],
      [3, 3],
    ])
  })

  it('tells a refused upload from an unreachable storage', async () => {
    const put = createXhrPut(FakeXhr as unknown as typeof XMLHttpRequest)

    const refused = put(slot, file)
    ;(FakeXhr.last as FakeXhr).finish(403)
    await expect(refused).rejects.toEqual(new ApiError(403, 'UPLOAD_FAILED', 'File upload failed'))

    const unreachable = put(slot, file)
    ;(FakeXhr.last as FakeXhr).onerror?.()
    await expect(unreachable).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
  })
})
