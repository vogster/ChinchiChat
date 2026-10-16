/** The Redis store @fastify/rate-limit uses itself; it ships without types. */
declare module '@fastify/rate-limit/store/RedisStore.js' {
  import type { Redis } from 'ioredis'

  export type RateLimitStoreCallback = (
    error: Error | null,
    result?: { current: number; ttl: number },
  ) => void

  export default class RedisStore {
    constructor(continueExceeding: boolean, exponentialBackoff: boolean, redis: Redis, key?: string)
    incr(key: string, callback: RateLimitStoreCallback, timeWindow: number, max: number): void
    read(key: string, callback: RateLimitStoreCallback, timeWindow: number, max: number): void
    child(routeOptions: object): RedisStore
  }
}
