import { randomBytes } from 'node:crypto'
import { MAX_BOTS_PER_OWNER, Permission } from '@chinchi/shared'
import { and, asc, count, eq, sql } from 'drizzle-orm'

import { uniqueViolationConstraint } from '../../db/errors'
import { sessions, users } from '../../db/schema'
import { guildTopic, userTopic } from '../../events/event-bus'
import { publishRevokedSessions } from '../../events/internal-events'
import { badRequest, conflict, forbidden, HttpError } from '../../http/http-error'
import { hashPassword } from '../auth/password'
import { generateSessionToken } from '../auth/session-token'
import { toMember } from '../guilds/guild.mapper'
import { createGuildRepository } from '../guilds/guild.repository'
import { createBanRepository, lockMembership } from '../moderation/ban.repository'
import { toPublicUser } from '../users/user.mapper'

import type { Database } from '../../db/client'
import type { EventBus } from '../../events/event-bus'
import type { GuildRepository } from '../guilds/guild.repository'
import type { GuildAccessChecks } from '../guilds/guild-access'
import type { GuildViews } from '../guilds/guild-views'
import type { UserRow } from '../users/user.repository'
import type { Bot, Snowflake, UpdateBotRequest } from '@chinchi/shared'

export interface BotServiceDeps {
  readonly db: Database
  readonly guilds: Pick<GuildRepository, 'addMember' | 'findMember' | 'listGuildIdsOf'>
  readonly access: Pick<GuildAccessChecks, 'requirePermission' | 'requireMember'>
  readonly views: Pick<GuildViews, 'detail'>
  readonly events: EventBus
  readonly nextId: () => Snowflake
  readonly now?: () => Date
}

/** Bot tokens don't expire by time; they end when renewed or the bot is deleted. */
const NEVER = new Date('9999-12-31T00:00:00.000Z')

const unknownBot = () => new HttpError(404, 'UNKNOWN_BOT', 'Unknown bot')

const toBot = (user: UserRow): Bot => ({
  user: toPublicUser(user),
  ownerId: user.botOwnerId as Snowflake,
  public: user.botPublic,
  createdAt: user.createdAt.toISOString(),
})

/** Bot accounts: owned by a person, signed in with a token, added to servers by their managers. */
export const createBotService = ({
  db,
  guilds,
  access,
  views,
  events,
  nextId,
  now = () => new Date(),
}: BotServiceDeps) => {
  const ownBot = async (ownerId: Snowflake, botId: Snowflake): Promise<UserRow> => {
    const [bot] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, botId), eq(users.isBot, true), eq(users.botOwnerId, ownerId)))
    if (!bot) throw unknownBot()
    return bot
  }

  /** A fresh token: every earlier one stops working. */
  const issueToken = async (botId: Snowflake): Promise<string> => {
    const { token, tokenHash } = generateSessionToken()
    await db.transaction(async (tx) => {
      await tx.delete(sessions).where(eq(sessions.userId, botId))
      await tx.insert(sessions).values({
        id: nextId(),
        userId: botId,
        tokenHash,
        userAgent: 'bot',
        ipAddress: null,
        expiresAt: NEVER,
      })
    })
    await publishRevokedSessions(events, botId, { scope: 'all' })
    return token
  }

  return {
    async list(ownerId: Snowflake): Promise<Bot[]> {
      const rows = await db
        .select()
        .from(users)
        .where(and(eq(users.isBot, true), eq(users.botOwnerId, ownerId)))
        .orderBy(asc(users.id))
      return rows.map(toBot)
    },

    async create(ownerId: Snowflake, username: string): Promise<{ bot: Bot; token: string }> {
      const id = nextId()
      let created: UserRow
      try {
        created = await db.transaction(async (tx) => {
          // Counted under a per-owner lock so parallel creations can't pass the cap.
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtextextended(${`bots:${ownerId}`}, 0))`,
          )
          const [owned] = await tx
            .select({ total: count() })
            .from(users)
            .where(and(eq(users.isBot, true), eq(users.botOwnerId, ownerId)))
          if (Number(owned?.total ?? 0) >= MAX_BOTS_PER_OWNER) {
            throw badRequest('TOO_MANY_BOTS', 'You own as many bots as allowed')
          }
          const [row] = await tx
            .insert(users)
            .values({
              id,
              username,
              // Never used: bots have no email or password sign-in.
              email: `${id}@bots.invalid`,
              passwordHash: await hashPassword(randomBytes(32).toString('base64url')),
              isBot: true,
              botOwnerId: ownerId,
            })
            .returning()
          return row as UserRow
        })
      } catch (error) {
        if (uniqueViolationConstraint(error)) {
          throw conflict('USERNAME_TAKEN', 'Username is already taken')
        }
        throw error
      }
      return { bot: toBot(created), token: await issueToken(created.id) }
    },

    async update(ownerId: Snowflake, botId: Snowflake, changes: UpdateBotRequest): Promise<Bot> {
      await ownBot(ownerId, botId)
      const [updated] = await db
        .update(users)
        .set({
          ...(changes.public !== undefined ? { botPublic: changes.public } : {}),
          ...(changes.displayName !== undefined ? { displayName: changes.displayName } : {}),
          updatedAt: now(),
        })
        .where(eq(users.id, botId))
        .returning()
      return toBot(updated as UserRow)
    },

    async renewToken(ownerId: Snowflake, botId: Snowflake): Promise<string> {
      await ownBot(ownerId, botId)
      return issueToken(botId)
    },

    /** The bot leaves every server and its token ends. */
    async delete(ownerId: Snowflake, botId: Snowflake): Promise<void> {
      await ownBot(ownerId, botId)
      const guildIds = await guilds.listGuildIdsOf(botId)
      await db.delete(users).where(eq(users.id, botId))
      await publishRevokedSessions(events, botId, { scope: 'all' })
      for (const guildId of guildIds) {
        await events.publish({
          topic: guildTopic(guildId),
          type: 'GUILD_MEMBER_REMOVE',
          data: { guildId, userId: botId },
        })
      }
    },

    /** A server manager adds their own bot, or anyone's public one. */
    async addToGuild(guildId: Snowflake, userId: Snowflake, botId: Snowflake): Promise<void> {
      await access.requirePermission(guildId, userId, Permission.ManageGuild)
      const bot = await db.transaction(async (tx) => {
        // Locks the bot's row: a delete running now can't leave a member without an account.
        const [found] = await tx
          .select()
          .from(users)
          .where(and(eq(users.id, botId), eq(users.isBot, true)))
          .for('update')
        if (!found || (!found.botPublic && found.botOwnerId !== userId)) throw unknownBot()
        if (await createGuildRepository(tx).findMember(guildId, botId)) return null
        // Banned bots stay out, as banned people do; the lock keeps a ban landing now in view.
        await lockMembership(tx, guildId, botId)
        if (await createBanRepository(tx).isBanned(guildId, botId)) {
          throw forbidden('BANNED', 'This bot is banned from this server')
        }
        // Bots are added by managers on purpose: no rules to accept.
        await createGuildRepository(tx).addMember(guildId, botId, { screen: false })
        return found
      })
      if (!bot) return
      const detail = await views.detail(await access.requireMember(guildId, botId))
      await events.publish({
        topic: userTopic(botId),
        type: 'GUILD_CREATE',
        data: { ...detail, presences: [] },
      })
      const member = await guilds.findMember(guildId, botId)
      if (member) {
        await events.publish({
          topic: guildTopic(guildId),
          type: 'GUILD_MEMBER_ADD',
          data: { guildId, member: toMember({ member, user: bot }) },
        })
      }
    },
  }
}

export type BotService = ReturnType<typeof createBotService>
