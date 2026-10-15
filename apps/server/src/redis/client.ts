import { Redis } from 'ioredis'

export interface RedisHandle {
  readonly redis: Redis
  readonly close: () => Promise<void>
}

/** Valkey/Redis connection (Valkey speaks the Redis protocol). */
export const createRedis = (url: string): RedisHandle => {
  const redis = new Redis(url, { maxRetriesPerRequest: 2, connectTimeout: 5_000 })
  return {
    redis,
    close: async () => {
      await redis.quit()
    },
  }
}
