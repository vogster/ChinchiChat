import rateLimit from '@fastify/rate-limit'
import fp from 'fastify-plugin'

import { addressBucket } from './address-bucket'
import { HttpError } from './http-error'

import type { Redis } from 'ioredis'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

/** Default for every route, keyed by client IP. */
export const GLOBAL_RATE_LIMIT = Object.freeze({ max: 300, timeWindow: MINUTE_MS })
/** Credential guessing protection. */
export const LOGIN_RATE_LIMIT = Object.freeze({ max: 10, timeWindow: MINUTE_MS })
/** Mass account creation protection. */
export const REGISTER_RATE_LIMIT = Object.freeze({ max: 10, timeWindow: HOUR_MS })

export interface RateLimitOptions {
  readonly enabled: boolean
  /** Shared store so limits hold across server processes. In-memory when omitted (unit tests). */
  readonly redis?: Redis | undefined
}

/**
 * Wrapped with fastify-plugin so the limiter applies to the whole app; a plain encapsulated
 * plugin would only cover routes registered inside it (i.e. none).
 */
export const rateLimitPlugin = fp<RateLimitOptions>(
  async (app, { enabled, redis }) => {
    if (!enabled) return

    await app.register(rateLimit, {
      ...GLOBAL_RATE_LIMIT,
      ...(redis ? { redis, nameSpace: 'chinchi:rl:' } : {}),
      // Fail open: a cache outage must not take the whole API down.
      skipOnError: true,
      // A whole IPv6 /64 counts as one address: otherwise one subscriber has millions.
      keyGenerator: (request) => addressBucket(request.ip),
      errorResponseBuilder: (_request, context) =>
        new HttpError(429, 'RATE_LIMITED', `Too many requests, retry in ${context.after}`),
    })
  },
  { name: 'chinchi-rate-limit' },
)
