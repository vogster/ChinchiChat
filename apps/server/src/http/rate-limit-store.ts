import RedisStore from '@fastify/rate-limit/store/RedisStore.js'

import { HttpError } from './http-error'

import type { RateLimitStoreCallback } from '@fastify/rate-limit/store/RedisStore.js'
import type { Redis } from 'ioredis'

interface Store {
  incr(key: string, callback: RateLimitStoreCallback, timeWindow: number, max: number): void
  read(key: string, callback: RateLimitStoreCallback, timeWindow: number, max: number): void
  child(routeOptions: object): Store
}

/** What a fail-closed route answers while the store is down; fail-open routes swallow it. */
const storeUnavailable = () =>
  new HttpError(503, 'RATE_LIMIT_UNAVAILABLE', 'Service is briefly unavailable, retry shortly')

/** The same store, reporting every failed check and turning its error into a 503. */
class WatchedStore implements Store {
  constructor(
    private readonly inner: Store,
    private readonly onError: (error: Error) => void,
  ) {}

  private guard(callback: RateLimitStoreCallback): RateLimitStoreCallback {
    return (error, result) => {
      if (error) {
        this.onError(error)
        callback(storeUnavailable())
        return
      }
      callback(null, result)
    }
  }

  incr(key: string, callback: RateLimitStoreCallback, timeWindow: number, max: number): void {
    this.inner.incr(key, this.guard(callback), timeWindow, max)
  }

  read(key: string, callback: RateLimitStoreCallback, timeWindow: number, max: number): void {
    this.inner.read(key, this.guard(callback), timeWindow, max)
  }

  child(routeOptions: object): Store {
    return new WatchedStore(this.inner.child(routeOptions), this.onError)
  }
}

/** What the plugin hands a store constructor (its merged global parameters; typed loosely upstream). */
interface StoreParams {
  readonly continueExceeding?: boolean
  readonly exponentialBackoff?: boolean
}

/**
 * A store constructor for @fastify/rate-limit: its own Redis store, watched. The plugin
 * instantiates it with the merged global parameters and derives per-route children from it.
 */
export const createWatchedRedisStore = (
  redis: Redis,
  nameSpace: string,
  onError: (error: Error) => void,
) =>
  class extends WatchedStore {
    constructor(params: StoreParams) {
      super(
        new RedisStore(
          params.continueExceeding ?? false,
          params.exponentialBackoff ?? false,
          redis,
          nameSpace,
        ),
        onError,
      )
    }
  }
