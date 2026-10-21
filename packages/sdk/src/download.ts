import { ApiError } from './errors'

import type { HttpOptions } from './http'

/** Bytes received so far, out of the length the server gave (null if it did not). */
export type DownloadProgress = (received: number, total: number | null) => void

export interface DownloadOptions {
  /** Cancels the download; it then rejects with the signal's reason (an `AbortError`). */
  readonly signal?: AbortSignal
  readonly onProgress?: DownloadProgress
}

/** Fetches a server file (`/api/v1/attachments/…`) that needs the session, as bytes. */
export type Download = (path: string, options?: DownloadOptions) => Promise<Blob>

/**
 * Reads the body piece by piece to tell how far it got. The pieces are kept as they came (no
 * copies): a file can be large. Cancelling also stops a read the server stalls.
 */
const readWithProgress = async (
  response: Response,
  onProgress: DownloadProgress,
  signal: AbortSignal | undefined,
): Promise<Blob> => {
  const type = response.headers.get('content-type') ?? ''
  const length = Number(response.headers.get('content-length'))
  const total = Number.isFinite(length) && length > 0 ? length : null
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
      onProgress(received, total)
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

  return async (path, { signal, onProgress } = {}) => {
    const headers = new Headers()
    const token = getToken?.()
    if (getToken) headers.set('x-auth-mode', 'bearer')
    if (token) headers.set('authorization', `Bearer ${token}`)
    const url = path.startsWith('/') && !path.startsWith('//') ? `${origin}${path}` : path

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
      return await (onProgress ? readWithProgress(response, onProgress, signal) : response.blob())
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? error
      throw new ApiError(0, 'NETWORK_ERROR', 'Network request failed')
    }
  }
}
