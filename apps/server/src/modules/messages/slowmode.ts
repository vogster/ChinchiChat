import type { Redis } from 'ioredis'

/** One message per member per interval in slowmode channels. */
export interface Slowmode {
  /** Uses up the member's turn; false when the previous one hasn't passed yet. */
  take(channelId: string, userId: string, seconds: number): Promise<boolean>
}

/** Shared by every server process, so a second instance can't double the allowance. */
export const createRedisSlowmode = (redis: Redis): Slowmode => ({
  async take(channelId, userId, seconds) {
    // The interval is part of the key: changing it (say, from hours to seconds) starts
    // everyone afresh instead of leaving them waiting out the old one.
    const key = `slowmode:${channelId}:${seconds}:${userId}`
    const set = await redis.set(key, '1', 'EX', seconds, 'NX')
    return set === 'OK'
  },
})

/** For a single process without Valkey (and unit tests). */
export const createMemorySlowmode = (now: () => number = Date.now): Slowmode => {
  const until = new Map<string, number>()
  return {
    async take(channelId, userId, seconds) {
      const key = `${channelId}:${seconds}:${userId}`
      const current = now()
      if ((until.get(key) ?? 0) > current) return false
      until.set(key, current + seconds * 1000)
      return true
    },
  }
}
