import rateLimit from '@fastify/rate-limit'
import fp from 'fastify-plugin'

import { addressBucket } from './address-bucket'
import { HttpError } from './http-error'
import { createWatchedRedisStore } from './rate-limit-store'

import type { Redis } from 'ioredis'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

/**
 * Routes that guess credentials or send mail would rather answer 503 than run unchecked while
 * Valkey is down; everything else fails open (see the plugin).
 */
export const FAIL_CLOSED = Object.freeze({ skipOnError: false })
/** Default for every route, keyed by client IP. */
export const GLOBAL_RATE_LIMIT = Object.freeze({ max: 300, timeWindow: MINUTE_MS })
/** Credential guessing protection. */
export const LOGIN_RATE_LIMIT = Object.freeze({ max: 10, timeWindow: MINUTE_MS, ...FAIL_CLOSED })
/** New QR sign-ins per address: every visit to the sign-in page asks, and again every two minutes. */
export const QR_LOGIN_CREATE_RATE_LIMIT = Object.freeze({
  max: 60,
  timeWindow: MINUTE_MS,
  ...FAIL_CLOSED,
})
/** The new device asks every couple of seconds whether it was approved; it issues sessions. */
export const QR_LOGIN_CLAIM_RATE_LIMIT = Object.freeze({
  max: 90,
  timeWindow: MINUTE_MS,
  ...FAIL_CLOSED,
})
/** Mass account creation protection. */
export const REGISTER_RATE_LIMIT = Object.freeze({ max: 10, timeWindow: HOUR_MS, ...FAIL_CLOSED })

export interface RateLimitOptions {
  readonly enabled: boolean
  /** Shared store so limits hold across server processes. In-memory when omitted (unit tests). */
  readonly redis?: Redis | undefined
  /** Called for every check Valkey failed to answer (a metric, a log line). */
  readonly onStoreError?: (error: Error) => void
}

/**
 * Wrapped with fastify-plugin so the limiter applies to the whole app; a plain encapsulated
 * plugin would only cover routes registered inside it (i.e. none).
 */
export const rateLimitPlugin = fp<RateLimitOptions>(
  async (app, { enabled, redis, onStoreError = () => undefined }) => {
    if (!enabled) return

    await app.register(rateLimit, {
      ...GLOBAL_RATE_LIMIT,
      ...(redis ? { store: createWatchedRedisStore(redis, 'chinchi:rl:', onStoreError) } : {}),
      // Fail open: a cache outage must not take the whole API down. Routes marked FAIL_CLOSED
      // answer 503 instead (the store turns the failure into RATE_LIMIT_UNAVAILABLE).
      skipOnError: true,
      // A whole IPv6 /64 counts as one address: otherwise one subscriber has millions.
      keyGenerator: (request) => addressBucket(request.ip),
      errorResponseBuilder: (_request, context) =>
        new HttpError(429, 'RATE_LIMITED', `Too many requests, retry in ${context.after}`),
    })
  },
  { name: 'chinchi-rate-limit' },
)

/**
 * A limit per signed-in user (per address before sign-in) under its own `scope`, so one
 * person's spree in a feature never eats the budget of everyone behind the same proxy.
 */
export const perUserRateLimit = (scope: string, max: number, timeWindow = MINUTE_MS) =>
  Object.freeze({
    max,
    timeWindow,
    // After the auth hook has resolved the session.
    hook: 'preHandler' as const,
    keyGenerator: (request: { auth: { user: { id: string } } | null; ip: string }) =>
      request.auth ? `${scope}:${request.auth.user.id}` : `${scope}:${addressBucket(request.ip)}`,
  })
