import { forbidden } from '../../http/http-error'

import type { FastifyRequest } from 'fastify'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export const isSafeMethod = (method: string): boolean => SAFE_METHODS.has(method.toUpperCase())

/**
 * Origin verification (OWASP-recommended alongside SameSite cookies).
 * Applies to state-changing requests that are not bearer-authenticated:
 * - a present Origin must be in the allow-list (also blocks login CSRF);
 * - a request carrying the session cookie must send an Origin at all.
 * Native clients authenticate with bearer tokens and are not subject to CSRF.
 */
export const assertTrustedOrigin = (
  request: FastifyRequest,
  allowedOrigins: readonly string[],
  hasSessionCookie: boolean,
): void => {
  const origin = request.headers.origin
  if (origin === undefined) {
    if (hasSessionCookie) throw csrfError()
    return
  }
  if (!allowedOrigins.includes(origin)) throw csrfError()
}

const csrfError = () => forbidden('CSRF_ORIGIN_MISMATCH', 'Request origin is not allowed')
