import { findBlockedWord, has, Permission } from '@chinchi/shared'
import { eq } from 'drizzle-orm'

import { guildAutomod } from '../../db/schema'
import { guildTopic } from '../../events/event-bus'
import { badRequest, HttpError } from '../../http/http-error'
import { activeTimeout } from '../guilds/guild.mapper'

import type { Database } from '../../db/client'
import type { EventBus } from '../../events/event-bus'
import type { GuildRepository } from '../guilds/guild.repository'
import type { GuildAccessChecks } from '../guilds/guild-access'
import type { AuditLogService } from '../moderation/audit-log.service'
import type { RoleRepository } from '../roles/role.repository'
import type { AutomodSettings, Snowflake } from '@chinchi/shared'
import type { Redis } from 'ioredis'

/** Anti-spam: more than this many messages within the window is flooding. */
export const SPAM_MESSAGES = 5
const SPAM_WINDOW_SECONDS = 5
const SPAM_TIMEOUT_MS = 5 * 60_000

const OFF: AutomodSettings = { blockedWords: [], antiSpam: false, maxMentions: null }

/** Short-lived counters shared by every server process (Valkey), or kept in memory. */
export interface AutomodCounters {
  /** Counts one member's message; returns how many they sent within the window. */
  hit(guildId: Snowflake, userId: Snowflake): Promise<number>
  /** True the first time for a key within `seconds` (to keep the audit log readable). */
  once(key: string, seconds: number): Promise<boolean>
}

export const createRedisAutomodCounters = (redis: Redis): AutomodCounters => ({
  async hit(guildId, userId) {
    const key = `automod-spam:${guildId}:${userId}`
    const results = await redis.multi().incr(key).expire(key, SPAM_WINDOW_SECONDS, 'NX').exec()
    return Number(results?.[0]?.[1] ?? 0)
  },
  async once(key, seconds) {
    return (await redis.set(`automod-once:${key}`, '1', 'EX', seconds, 'NX')) === 'OK'
  },
})

export const createMemoryAutomodCounters = (now: () => number = Date.now): AutomodCounters => {
  const windows = new Map<string, { count: number; until: number }>()
  const bump = (key: string, seconds: number) => {
    const current = now()
    const entry = windows.get(key)
    const next =
      !entry || entry.until <= current
        ? { count: 1, until: current + seconds * 1000 }
        : { ...entry, count: entry.count + 1 }
    windows.set(key, next)
    return next.count
  }
  return {
    hit: async (guildId, userId) => bump(`spam:${guildId}:${userId}`, SPAM_WINDOW_SECONDS),
    once: async (key, seconds) => bump(`once:${key}`, seconds) === 1,
  }
}

export interface AutomodServiceDeps {
  readonly db: Database
  readonly access: Pick<GuildAccessChecks, 'requirePermission'>
  readonly guilds: Pick<GuildRepository, 'extendTimeout'>
  readonly roles: Pick<RoleRepository, 'memberRoleIds'>
  readonly events: EventBus
  readonly audit: Pick<AuditLogService, 'record'>
  readonly counters: AutomodCounters
  readonly now?: () => Date
}

export interface AutomodCheck {
  readonly guildId: Snowflake
  readonly authorId: Snowflake
  readonly content: string
  /** People, roles and @everyone/@here the message would mention. */
  readonly mentionCount: number
  /** The author's permissions in the channel: moderators are never held back. */
  readonly permissions: bigint
  /** New messages count toward anti-spam; edits don't. */
  readonly isNew: boolean
  /** The channel has slowmode, which already paces people: anti-spam stays out of it. */
  readonly slowmode: boolean
}

/** Word filter, mention limit and anti-spam for server messages. */
export const createAutomodService = ({
  db,
  access,
  guilds,
  roles,
  events,
  audit,
  counters,
  now = () => new Date(),
}: AutomodServiceDeps) => {
  const load = async (guildId: Snowflake): Promise<AutomodSettings> => {
    const [row] = await db.select().from(guildAutomod).where(eq(guildAutomod.guildId, guildId))
    return row
      ? { blockedWords: row.blockedWords, antiSpam: row.antiSpam, maxMentions: row.maxMentions }
      : OFF
  }

  /** A flood earns a short timeout, announced like a moderator's. */
  const timeOut = async (guildId: Snowflake, userId: Snowflake) => {
    const until = new Date(now().getTime() + SPAM_TIMEOUT_MS)
    const member = await guilds.extendTimeout(guildId, userId, until)
    if (!member) return
    await events.publish({
      topic: guildTopic(guildId),
      type: 'GUILD_MEMBER_UPDATE',
      data: {
        guildId,
        userId,
        roleIds: await roles.memberRoleIds(guildId, userId),
        nickname: member.nickname,
        timeoutUntil: activeTimeout(member.timeoutUntil),
      },
    })
    await audit.record({
      guildId,
      action: 'member_timeout',
      actorId: null,
      targetUserId: userId,
      reason: 'Automod: spam',
      data: { until: until.toISOString() },
    })
  }

  return {
    async settings(guildId: Snowflake, userId: Snowflake): Promise<AutomodSettings> {
      await access.requirePermission(guildId, userId, Permission.ManageGuild)
      return load(guildId)
    },

    async update(
      guildId: Snowflake,
      userId: Snowflake,
      changes: Partial<AutomodSettings>,
    ): Promise<AutomodSettings> {
      await access.requirePermission(guildId, userId, Permission.ManageGuild)
      const values = { ...changes, updatedAt: now() }
      await db
        .insert(guildAutomod)
        .values({ guildId, ...values })
        .onConflictDoUpdate({ target: guildAutomod.guildId, set: values })
      await audit.record({
        guildId,
        action: 'automod_update',
        actorId: userId,
        data: { changes: Object.keys(changes) },
      })
      return load(guildId)
    },

    /** Throws when automod refuses the message; called before it is stored. */
    async check({
      guildId,
      authorId,
      content,
      mentionCount,
      permissions,
      isNew,
      slowmode,
    }: AutomodCheck) {
      if (has(permissions, Permission.ManageMessages)) return
      const settings = await load(guildId)
      const word = findBlockedWord(content, settings.blockedWords)
      if (word) {
        // One entry per person per minute: retries mustn't bury real moderation.
        if (await counters.once(`block:${guildId}:${authorId}`, 60)) {
          await audit.record({
            guildId,
            action: 'automod_block',
            actorId: authorId,
            targetUserId: authorId,
            data: { word },
          })
        }
        throw badRequest('AUTOMOD_BLOCKED', 'The message contains a word blocked on this server')
      }
      if (settings.maxMentions !== null && mentionCount > settings.maxMentions) {
        throw badRequest('AUTOMOD_MENTIONS', 'The message mentions too many people')
      }
      if (isNew && !slowmode && settings.antiSpam) {
        const sent = await counters.hit(guildId, authorId)
        if (sent > SPAM_MESSAGES) {
          // Only the first message over the limit acts; the rest of a burst is just refused.
          if (sent === SPAM_MESSAGES + 1) await timeOut(guildId, authorId)
          throw new HttpError(429, 'AUTOMOD_SPAM', 'Slow down: you were timed out for spam')
        }
      }
    },
  }
}

export type AutomodService = ReturnType<typeof createAutomodService>
