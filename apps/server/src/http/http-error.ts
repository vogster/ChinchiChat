/**
 * An error that is safe to show to the client. `code` is a stable machine-readable identifier
 * that clients use for i18n; `message` is a human-readable English fallback.
 */
export class HttpError extends Error {
  override readonly name = 'HttpError'

  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export const badRequest = (code: string, message: string) => new HttpError(400, code, message)
export const unauthorized = (code = 'UNAUTHORIZED', message = 'Authentication required') =>
  new HttpError(401, code, message)
export const forbidden = (code: string, message: string) => new HttpError(403, code, message)
export const conflict = (code: string, message: string) => new HttpError(409, code, message)
