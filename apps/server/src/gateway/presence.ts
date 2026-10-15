import { guildTopic, userTopic } from '../events/event-bus'

import type { EventBus } from '../events/event-bus'
import type { CustomStatus, Presence, PresenceStatus, SelectableStatus } from '@chinchi/shared'
import type { Redis } from 'ioredis'

const sessionsKey = (userId: string) => `chinchi:presence:sessions:${userId}`
const choiceKey = (userId: string) => `chinchi:presence:status:${userId}`
/** The custom status as JSON; a timed one expires with the key. */
const customKey = (userId: string) => `chinchi:presence:custom:${userId}`
/** Every live device across users, by expiry: lets a sweep find the ones that died. */
const EXPIRY_INDEX = 'chinchi:presence:expiry'
const indexMember = (userId: string, sessionId: string) => `${userId}:${sessionId}`
const SWEEP_BATCH = 1000

export interface PresenceDeps {
  readonly redis: Redis
  readonly events: EventBus
  /** Servers whose members should hear about this user's status. */
  readonly guildIdsFor: (userId: string) => Promise<readonly string[]>
  /** Friends hear about this user's status even without a shared server. */
  readonly friendIdsFor?: (userId: string) => Promise<readonly string[]>
  /** A device counts as connected until this long after its last heartbeat. */
  readonly ttlMs: number
  readonly now?: () => number
}

/**
 * Online status: a user is online while at least one device is connected (each device is a
 * gateway session with an expiry refreshed by heartbeats, so crashed processes age out).
 * The chosen status (online/idle/dnd/invisible) applies on top; invisible looks offline.
 */
export const createPresence = ({
  redis,
  events,
  guildIdsFor,
  friendIdsFor = async () => [],
  ttlMs,
  now = Date.now,
}: PresenceDeps) => {
  const liveCount = async (userId: string) => {
    await redis.zremrangebyscore(sessionsKey(userId), '-inf', now())
    return redis.zcard(sessionsKey(userId))
  }

  const choice = async (userId: string): Promise<SelectableStatus> =>
    ((await redis.get(choiceKey(userId))) as SelectableStatus | null) ?? 'online'

  const effective = (connected: boolean, chosen: SelectableStatus): PresenceStatus =>
    !connected || chosen === 'invisible' ? 'offline' : chosen

  const parseCustom = (raw: string | null | undefined): CustomStatus | null =>
    raw ? (JSON.parse(raw) as CustomStatus) : null

  const custom = async (userId: string) => parseCustom(await redis.get(customKey(userId)))

  /**
   * Tells the user's servers and friends. Offline users show no custom status; `customStatus`
   * passes a change explicitly (null announces its removal).
   */
  const announce = async (
    userId: string,
    status: PresenceStatus,
    customStatus?: CustomStatus | null,
  ) => {
    const [guildIds, friendIds, current] = await Promise.all([
      guildIdsFor(userId),
      friendIdsFor(userId),
      status === 'offline' || customStatus !== undefined ? null : custom(userId),
    ])
    const shown = status === 'offline' ? undefined : (customStatus ?? current ?? undefined)
    const data = {
      userId,
      status,
      ...(shown ? { customStatus: shown } : customStatus === null ? { customStatus: null } : {}),
    }
    const topics = [...guildIds.map(guildTopic), ...friendIds.map(userTopic)]
    await Promise.all(
      topics.map((topic) => events.publish({ topic, type: 'PRESENCE_UPDATE', data })),
    )
  }

  const touch = async (userId: string, sessionId: string) => {
    const expiry = now() + ttlMs
    await redis
      .multi()
      .zadd(sessionsKey(userId), expiry, sessionId)
      .zadd(EXPIRY_INDEX, expiry, indexMember(userId, sessionId))
      .exec()
  }

  const goneOffline = async (userId: string) =>
    (await liveCount(userId)) === 0 && (await choice(userId)) !== 'invisible'

  return {
    async connect(userId: string, sessionId: string): Promise<void> {
      const wasOffline = (await liveCount(userId)) === 0
      await touch(userId, sessionId)
      const chosen = await choice(userId)
      if (wasOffline && chosen !== 'invisible') await announce(userId, chosen)
    },

    refresh: touch,

    async disconnect(userId: string, sessionId: string): Promise<void> {
      await redis
        .multi()
        .zrem(sessionsKey(userId), sessionId)
        .zrem(EXPIRY_INDEX, indexMember(userId, sessionId))
        .exec()
      if (await goneOffline(userId)) await announce(userId, 'offline')
    },

    /**
     * Takes offline the devices whose process died without disconnecting them (no heartbeat
     * for a whole TTL), announcing users who have nothing left. Returns how many went offline.
     */
    async sweep(): Promise<number> {
      const due = await redis.zrangebyscore(EXPIRY_INDEX, '-inf', now(), 'LIMIT', 0, SWEEP_BATCH)
      let wentOffline = 0
      for (const member of due) {
        const [userId = '', sessionId = ''] = member.split(':')
        const score = await redis.zscore(sessionsKey(userId), sessionId)
        // Refreshed meanwhile: its index entry moved forward too, nothing to do.
        if (score !== null && Number(score) > now()) continue
        await redis.multi().zrem(EXPIRY_INDEX, member).zrem(sessionsKey(userId), sessionId).exec()
        // Already cleaned up with another of the user's devices: announced then.
        if (score !== null && (await goneOffline(userId))) {
          await announce(userId, 'offline')
          wentOffline += 1
        }
      }
      return wentOffline
    },

    async setStatus(userId: string, status: SelectableStatus): Promise<void> {
      await redis.set(choiceKey(userId), status)
      await announce(userId, effective((await liveCount(userId)) > 0, status))
    },

    /** My custom status, also while invisible. */
    custom,

    /** Sets (or with null clears) the custom status; others hear about it unless I look offline. */
    async setCustom(userId: string, status: CustomStatus | null): Promise<void> {
      if (status === null) await redis.del(customKey(userId))
      else if (status.expiresAt === null) await redis.set(customKey(userId), JSON.stringify(status))
      else {
        // Redis expires keys by the wall clock, whatever clock presence itself runs on.
        const ttl = Math.max(1, Date.parse(status.expiresAt) - Date.now())
        await redis.set(customKey(userId), JSON.stringify(status), 'PX', ttl)
      }
      const shown = effective((await liveCount(userId)) > 0, await choice(userId))
      if (shown !== 'offline') await announce(userId, shown, status)
    },

    /** Statuses of the given users that are not offline (absent means offline). */
    async visible(userIds: readonly string[]): Promise<Presence[]> {
      if (userIds.length === 0) return []
      // One round trip for everyone: READY asks about every member of every server.
      const pipeline = redis.pipeline()
      for (const userId of userIds) {
        pipeline.zcount(sessionsKey(userId), `(${now()}`, '+inf')
        pipeline.get(choiceKey(userId))
        pipeline.get(customKey(userId))
      }
      const replies = (await pipeline.exec()) ?? []
      return userIds.flatMap((userId, index) => {
        const live = Number(replies[index * 3]?.[1] ?? 0)
        const chosen = (replies[index * 3 + 1]?.[1] as SelectableStatus | null) ?? 'online'
        const customStatus = parseCustom(replies[index * 3 + 2]?.[1] as string | null)
        const status = effective(live > 0, chosen)
        if (status === 'offline') return []
        return [{ userId, status, ...(customStatus ? { customStatus } : {}) }]
      })
    },
  }
}

export type PresenceService = ReturnType<typeof createPresence>
