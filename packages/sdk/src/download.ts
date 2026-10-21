import { ApiError } from './errors'

import type { HttpOptions } from './http'

/** Fetches a server file (`/api/v1/attachments/…`) that needs the session, as bytes. */
export type Download = (path: string) => Promise<Blob>

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

  return async (path) => {
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
      })
    } catch {
      throw new ApiError(0, 'NETWORK_ERROR', 'Network request failed')
    }
    if (!response.ok) {
      throw new ApiError(
        response.status,
        `HTTP_${response.status}`,
        response.statusText || 'Download failed',
      )
    }
    return response.blob()
  }
}
