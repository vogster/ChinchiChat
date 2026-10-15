import { z } from 'zod'

import { ApiError } from './errors'

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export interface HttpOptions {
  /** e.g. `/api/v1` (same origin) or `https://chat.example.com/api/v1`. */
  readonly baseUrl: string
  readonly fetch?: FetchLike
  /** Native clients: returns the session token. Omit in browsers to use the httpOnly cookie. */
  readonly getToken?: () => string | null | undefined
}

export interface RequestOptions<T> {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  readonly path: string
  /** JSON-serialized, except a Blob, which is sent as is with its own type. */
  readonly body?: unknown
  /** Schema of `data` in the success envelope; omit for 204 responses. */
  readonly data?: z.ZodType<T>
}

const errorEnvelope = z.object({
  success: z.literal(false),
  code: z.string(),
  error: z.string(),
  details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
})

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

export const createHttp = ({ baseUrl, fetch = globalThis.fetch, getToken }: HttpOptions) => {
  const base = baseUrl.replace(/\/+$/, '')

  const buildInit = (method: string, body: unknown): RequestInit => {
    const headers = new Headers({ accept: 'application/json' })
    // Files (avatars, icons) go as they are; everything else is JSON.
    const isFile = body instanceof Blob
    if (isFile) headers.set('content-type', body.type || 'application/octet-stream')
    else if (body !== undefined) headers.set('content-type', 'application/json')

    const token = getToken?.()
    if (getToken) headers.set('x-auth-mode', 'bearer')
    if (token) headers.set('authorization', `Bearer ${token}`)

    return {
      method,
      headers,
      credentials: getToken ? 'omit' : 'include',
      ...(isFile ? { body } : body !== undefined ? { body: JSON.stringify(body) } : {}),
    }
  }

  return async function request<T = void>({
    method,
    path,
    body,
    data,
  }: RequestOptions<T>): Promise<T> {
    let response: Response
    try {
      response = await fetch(`${base}${path}`, buildInit(method, body))
    } catch {
      throw new ApiError(0, 'NETWORK_ERROR', 'Network request failed')
    }

    if (!response.ok) {
      const parsed = errorEnvelope.safeParse(await readJson(response))
      if (!parsed.success) {
        throw new ApiError(
          response.status,
          `HTTP_${response.status}`,
          response.statusText || 'Request failed',
        )
      }
      const { code, error, details } = parsed.data
      throw new ApiError(response.status, code, error, details)
    }

    if (!data) return undefined as T

    const envelope = z
      .object({ success: z.literal(true), data })
      .safeParse(await readJson(response))
    if (!envelope.success) {
      throw new ApiError(response.status, 'INVALID_RESPONSE', 'Unexpected response from server')
    }
    return envelope.data.data
  }
}

export type Http = ReturnType<typeof createHttp>
