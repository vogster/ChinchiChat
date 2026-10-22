import { ApiError } from './errors'

import type { HttpOptions } from './http'

/** Bytes received so far, out of the length the server gave (null if it did not). */
export type DownloadProgress = (received: number, total: number | null) => void

export interface DownloadOptions {
  /** Cancels the download; it then rejects with the signal's reason (an `AbortError`). */
  readonly signal?: AbortSignal
  readonly onProgress?: DownloadProgress
  /** Stops (`DOWNLOAD_TOO_LARGE`) once more than this comes: memory is the limit otherwise. */
  readonly maxBytes?: number
}

const tooLarge = () => new ApiError(0, 'DOWNLOAD_TOO_LARGE', 'The file is bigger than expected')

/** Fetches a server file (`/api/v1/attachments/…`) that needs the session, as bytes. */
export type Download = (path: string, options?: DownloadOptions) => Promise<Blob>

/**
 * Reads the body piece by piece to tell how far it got and to stop at `maxBytes`. The pieces are
 * kept as they came (no copies): a file can be large. Cancelling also stops a read the server
 * stalls.
 */
const readBody = async (
  response: Response,
  { onProgress, maxBytes = Number.POSITIVE_INFINITY, signal }: DownloadOptions,
): Promise<Blob> => {
  const type = response.headers.get('content-type') ?? ''
  const length = Number(response.headers.get('content-length'))
  const total = Number.isFinite(length) && length > 0 ? length : null
  if (total !== null && total > maxBytes) throw tooLarge()
  const reader = response.body?.getReader()
  if (!reader) return response.blob()

  const stop = () => void reader.cancel(signal?.reason).catch(() => undefined)
  signal?.addEventListener('abort', stop, { once: true })
  try {
    const chunks: Uint8Array<ArrayBuffer>[] = []
    let received = 0
    for (;;) {
      signal?.throwIfAborted()
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.byteLength
      if (received > maxBytes) throw tooLarge()
      onProgress?.(received, total)
    }
    signal?.throwIfAborted()
    return new Blob(chunks, { type })
  } finally {
    signal?.removeEventListener('abort', stop)
  }
}

/**
 * The server names files by path from its root, not from the API prefix, and serving them
 * needs the session: a browser tab sends its cookie by itself, a native client has to carry
 * the token, which an `<img>` cannot do. This is the fetch that can.
 */
export const createDownload = ({
  baseUrl,
  fetch = globalThis.fetch,
  getToken,
}: HttpOptions): Download => {
  const origin = /^https?:\/\//.test(baseUrl) ? new URL(baseUrl).origin : ''

  /** The instance's own address: the session goes there and nowhere else. */
  const isOwn = (url: string) =>
    origin === ''
      ? url.startsWith('/') && !url.startsWith('//')
      : url === origin || url.startsWith(`${origin}/`)

  return async (path, options = {}) => {
    const { signal, onProgress, maxBytes } = options
    const headers = new Headers()
    const url = path.startsWith('/') && !path.startsWith('//') ? `${origin}${path}` : path
    const token = getToken && isOwn(url) ? getToken() : undefined
    if (getToken) headers.set('x-auth-mode', 'bearer')
    if (token) headers.set('authorization', `Bearer ${token}`)

    let response: Response
    try {
      response = await fetch(url, {
        method: 'GET',
        headers,
        credentials: getToken ? 'omit' : 'include',
        signal,
      })
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? error
      throw new ApiError(0, 'NETWORK_ERROR', 'Network request failed')
    }
    if (!response.ok) {
      throw new ApiError(
        response.status,
        `HTTP_${response.status}`,
        response.statusText || 'Download failed',
      )
    }
    try {
      return await (onProgress || maxBytes !== undefined
        ? readBody(response, options)
        : response.blob())
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? error
      if (error instanceof ApiError) throw error
      throw new ApiError(0, 'NETWORK_ERROR', 'Network request failed')
    }
  }
}
