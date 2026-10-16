import { DEFAULT_EVERYONE_PERMISSIONS, Permission } from '@chinchi/shared'
import { count, eq, sql } from 'drizzle-orm'

import { guilds as guildsTable, users } from '../../db/schema'
import { guildTopic, userTopic } from '../../events/event-bus'
import { badRequest, forbidden, HttpError } from '../../http/http-error'
import { createChannelRepository } from '../channels/channel.repository'
import { createRoleRepository } from '../roles/role.repository'
import { defaultChannels } from './default-channels'
import { activeTimeout, toGuild, toMember } from './guild.mapper'
import { createGuildRepository } from './guild.repository'

import type { Database } from '../../db/client'
import type { EventBus } from '../../events/event-bus'
import type { AuditLogService } from '../moderation/audit-log.service'
import type { RoleRepository } from '../roles/role.repository'
import type { GuildRepository, GuildRow } from './guild.repository'
import type { GuildAccessChecks } from './guild-access'
import type { GuildViews } from './guild-views'
import type { createGuildRequestSchema, GuildDetail, Member, Snowflake } from '@chinchi/shared'
import type { z } from 'zod'

/** Parsed request: the schema has already filled in the default locale. */
type CreateGuildInput = z.output<typeof createGuildRequestSchema>

const NO_AUDIT: Pick<AuditLogService, 'record'> = { record: async () => undefined }

export interface GuildServiceDeps {
  readonly db: Database
  readonly guilds: GuildRepository
  readonly roles: RoleRepository
  readonly access: GuildAccessChecks
  readonly views: GuildViews
  readonly events: EventBus
  readonly nextId: () => Snowflake
  /** After a server is deleted, e.g. to remove its files. */
  readonly onDeleted?: (guild: GuildRow) => Promise<void>
  /** Writes moderation and settings changes to the server's audit log. */
  readonly audit?: Pick<AuditLogService, 'record'>
  /** Servers one person may own (instance setting); null is no limit. */
  readonly ownedGuildLimit?: () => Promise<number | null>
  /**
   * Storage keys of the server's files that only the database knows (emoji): collected
   * before deletion, since its rows go with the server.
   */
  readonly filesOf?: (guildId: Snowflake) => Promise<string[]>
  readonly discardFiles?: (keys: readonly string[]) => Promise<void>
}

export const createGuildService = ({
  db,
  guilds,
  roles,
  access,
  views,
  events,
  nextId,
  onDeleted = async () => undefined,
  audit = NO_AUDIT,
  ownedGuildLimit = async () => null,
  filesOf = async () => [],
  discardFiles = async () => undefined,
}: GuildServiceDeps) => {
  const publishUpdate = (guild: GuildRow) =>
    events.publish({ topic: guildTopic(guild.id), type: 'GUILD_UPDATE', data: toGuild(guild) })

  /**
   * Refuses when the owner already has as many servers as the instance allows. Serialized
   * per owner, so parallel creations or transfers can't each pass the count.
   */
  const assertOwnerSlot = async (
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    ownerId: Snowflake,
    limit: number | null,
  ) => {
    if (limit === null) return
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`guild-owner:${ownerId}`}, 0))`,
    )
    const [owned] = await tx
      .select({ total: count() })
      .from(guildsTable)
      .where(eq(guildsTable.ownerId, ownerId))
    if (Number(owned?.total ?? 0) >= limit) {
      throw forbidden('GUILD_LIMIT', 'That account owns as many servers as this instance allows')
    }
  }

  const remove = async (guild: GuildRow) => {
    const files = await filesOf(guild.id)
    await guilds.delete(guild.id)
    await onDeleted(guild)
    await discardFiles(files)
    await events.publish({
      topic: guildTopic(guild.id),
      type: 'GUILD_DELETE',
      data: { id: guild.id },
    })
  }

  return {
    /** Server, owner membership, @everyone and default channels are created atomically. */
    async create(ownerId: Snowflake, { name, locale }: CreateGuildInput): Promise<GuildDetail> {
      const limit = await ownedGuildLimit()
      const guildId = await db.transaction(async (tx) => {
        await assertOwnerSlot(tx, ownerId, limit)
        const txGuilds = createGuildRepository(tx)
        const guild = await txGuilds.insert({ id: nextId(), name, ownerId })
        await txGuilds.addMember(guild.id, ownerId)
        await createRoleRepository(tx).insert({
          id: guild.id,
          guildId: guild.id,
          name: '@everyone',
          color: 0,
          position: 0,
          permissions: DEFAULT_EVERYONE_PERMISSIONS,
          hoist: false,
          mentionable: false,
        })
        await createChannelRepository(tx).insertMany(defaultChannels(guild.id, locale, nextId))
        return guild.id
      })
      const detail = await views.detail(await access.requireMember(guildId, ownerId))
      // The owner's other devices learn about the new server too.
      await events.publish({ topic: userTopic(ownerId), type: 'GUILD_CREATE', data: detail })
      return detail
    },

    listForUser: (userId: Snowflake) => guilds.listForUser(userId),

    async get(guildId: Snowflake, userId: Snowflake): Promise<GuildDetail> {
      return views.detail(await access.requireMember(guildId, userId))
    },

    /** Name and rules; blank rules (null) turn them off and stop holding newcomers back. */
    async update(
      guildId: Snowflake,
      userId: Snowflake,
      changes: { name?: string | undefined; rules?: string | null | undefined },
    ): Promise<GuildDetail> {
      await access.requirePermission(guildId, userId, Permission.ManageGuild)
      const set = {
        ...(changes.name !== undefined ? { name: changes.name } : {}),
        ...(changes.rules !== undefined ? { rules: changes.rules } : {}),
      }
      await publishUpdate(await guilds.update(guildId, set))
      await audit.record({ guildId, action: 'guild_update', actorId: userId, data: set })
      return views.detail(await access.requireMember(guildId, userId))
    },

    /** A newcomer accepts the rules and may talk from now on. */
    async acceptRules(guildId: Snowflake, userId: Snowflake): Promise<GuildDetail> {
      const member = await access.requireMember(guildId, userId)
      if (await guilds.acceptRules(guildId, userId)) {
        await events.publish({
          topic: guildTopic(guildId),
          type: 'GUILD_MEMBER_UPDATE',
          data: {
            guildId,
            userId,
            roleIds: [...member.memberRoleIds],
            nickname: member.member.nickname,
            timeoutUntil: activeTimeout(member.member.timeoutUntil),
            pending: false,
          },
        })
      }
      return views.detail(await access.requireMember(guildId, userId))
    },

    /** Only the owner can delete the server; no permission is powerful enough. */
    async delete(guildId: Snowflake, userId: Snowflake): Promise<void> {
      const { guild } = await access.requireOwner(guildId, userId)
      await remove(guild)
    },

    /** Instance admins remove any server, with the same effects as its owner deleting it. */
    async forceDelete(guildId: Snowflake): Promise<void> {
      const guild = await guilds.findById(guildId)
      if (!guild) throw new HttpError(404, 'UNKNOWN_GUILD', 'Unknown server')
      await remove(guild)
    },

    async transferOwnership(
      guildId: Snowflake,
      userId: Snowflake,
      newOwnerId: Snowflake,
    ): Promise<GuildDetail> {
      await access.requireOwner(guildId, userId)
      if (!(await guilds.findMember(guildId, newOwnerId))) {
        throw new HttpError(404, 'UNKNOWN_MEMBER', 'That user is not a member of this server')
      }
      const [target] = await db
        .select({ isBot: users.isBot })
        .from(users)
        .where(eq(users.id, newOwnerId))
      // A bot's account goes away with its owner; the server must not go with it.
      if (target?.isBot) throw badRequest('BOT_CANNOT_OWN', 'Bots cannot own servers')
      const limit = await ownedGuildLimit()
      const updated = await db.transaction(async (tx) => {
        await assertOwnerSlot(tx, newOwnerId, limit)
        return createGuildRepository(tx).update(guildId, { ownerId: newOwnerId })
      })
      await publishUpdate(updated)
      return views.detail(await access.requireMember(guildId, userId))
    },

    async listMembers(guildId: Snowflake, userId: Snowflake): Promise<Member[]> {
      await access.requireMember(guildId, userId)
      const [members, roleIds] = await Promise.all([
        guilds.listMembers(guildId),
        roles.memberRoleIdsByUser(guildId),
      ])
      return members.map((member) => toMember(member, roleIds.get(member.user.id)))
    },

    async leave(guildId: Snowflake, userId: Snowflake): Promise<void> {
      const { isOwner } = await access.requireMember(guildId, userId)
      if (isOwner) {
        throw badRequest(
          'OWNER_CANNOT_LEAVE',
          'Transfer ownership or delete the server before leaving it',
        )
      }
      await guilds.removeMember(guildId, userId)
      await events.publish({
        topic: userTopic(userId),
        type: 'GUILD_DELETE',
        data: { id: guildId },
      })
      await events.publish({
        topic: guildTopic(guildId),
        type: 'GUILD_MEMBER_REMOVE',
        data: { guildId, userId },
      })
    },
  }
}

export type GuildService = ReturnType<typeof createGuildService>
