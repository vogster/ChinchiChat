import type { Redis } from 'ioredis'

/** How long someone waits to ask the same person again after being declined. */
export const FRIEND_COOLDOWN_SECONDS = 24 * 60 * 60

/** A declined request holds back the asker's next one to the same person for a while. */
export interface FriendCooldown {
  start(fromId: string, toId: string): Promise<void>
  active(fromId: string, toId: string): Promise<boolean>
}

const keyOf = (fromId: string, toId: string) => `friend-cooldown:${fromId}:${toId}`

/** Shared by every server process; the key expires by itself. */
export const createRedisFriendCooldown = (redis: Redis): FriendCooldown => ({
  async start(fromId, toId) {
    await redis.set(keyOf(fromId, toId), '1', 'EX', FRIEND_COOLDOWN_SECONDS)
  },
  async active(fromId, toId) {
    return (await redis.exists(keyOf(fromId, toId))) === 1
  },
})

/** For a single process without Valkey (and unit tests). */
export const createMemoryFriendCooldown = (now: () => number = Date.now): FriendCooldown => {
  const until = new Map<string, number>()
  return {
    async start(fromId, toId) {
      until.set(keyOf(fromId, toId), now() + FRIEND_COOLDOWN_SECONDS * 1000)
    },
    async active(fromId, toId) {
      return (until.get(keyOf(fromId, toId)) ?? 0) > now()
    },
  }
}
