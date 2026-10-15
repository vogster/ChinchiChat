export interface ApiErrorDetail {
  readonly path: string
  readonly message: string
}

/**
 * Any failed API call. `code` is the server's stable error code (e.g. `USERNAME_TAKEN`), or one of
 * the client-side codes: `NETWORK_ERROR`, `INVALID_RESPONSE`, `HTTP_<status>`.
 */
export class ApiError extends Error {
  override readonly name = 'ApiError'

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: readonly ApiErrorDetail[] = [],
  ) {
    super(message)
  }
}

export const isApiError = (value: unknown): value is ApiError => value instanceof ApiError
