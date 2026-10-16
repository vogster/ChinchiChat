import {
  CHANNEL_NAME_MAX_LENGTH,
  has,
  MAX_CHANNELS_PER_GUILD,
  normalizeTextChannelName,
  Permission,
} from '@chinchi/shared'
import { and, count, eq, ne, sql } from 'drizzle-orm'

import { channels as channelsTable } from '../../db/schema'
import { guildTopic } from '../../events/event-bus'
import { badRequest, forbidden, HttpError } from '../../http/http-error'
import { createChannelRepository, isGuildChannel } from './channel.repository'
import { createOverwriteOperations, invalidThreadTarget } from './channel-overwrites'

import type { Database } from '../../db/client'
import type { EventBus } from '../../events/event-bus'
import type { GuildRepository } from '../guilds/guild.repository'
import type { AnyChannelAccess, ChannelAccess, GuildAccessChecks } from '../guilds/guild-access'
import type { GuildViews } from '../guilds/guild-views'
import type { AuditLogService } from '../moderation/audit-log.service'
import type { OverwriteRepository } from '../roles/overwrite.repository'
import type { RoleRepository } from '../roles/role.repository'
import type { AnyChannelRow, ChannelRepository, ChannelRow } from './channel.repository'
import type {
  Channel,
  ChannelType,
  ReorderChannelsRequest,
  Snowflake,
  UpdateChannelRequest,
} from '@chinchi/shared'

const NO_AUDIT: Pick<AuditLogService, 'record'> = { record: async () => undefined }

export interface CreateChannelInput {
  readonly type: ChannelType
  readonly name: string
  readonly parentId: Snowflake | null
  readonly topic?: string | undefined
}

export interface ChannelServiceDeps {
  readonly db: Database
  readonly channels: ChannelRepository
  readonly overwrites: OverwriteRepository
  readonly roles: RoleRepository
  readonly guilds: GuildRepository
  readonly access: GuildAccessChecks
  readonly views: GuildViews
  readonly events: EventBus
  readonly nextId: () => Snowflake
  /** Permissions in a DM, or null for non-members (the DM module provides it). */
  readonly privatePermissions?: (
    channel: AnyChannelRow,
    userId: Snowflake,
  ) => Promise<bigint | null>
  /** Called after a voice channel is deleted (to disconnect whoever is in it). */
  readonly onVoiceChannelDeleted?: (channelId: Snowflake, guildId: Snowflake) => Promise<void>
  /** Writes moderation and settings changes to the server's audit log. */
  readonly audit?: Pick<AuditLogService, 'record'>
  /** Whether a channel holds messages by anyone but this user (thread deletion). */
  readonly hasOthersMessages?: (channelId: Snowflake, userId: Snowflake) => Promise<boolean>
}

const unknownChannel = () => new HttpError(404, 'UNKNOWN_CHANNEL', 'Unknown channel')
const invalidParent = () =>
  badRequest('INVALID_PARENT', 'Channels can only be placed inside a category of the same server')

const normalizeName = (type: ChannelType, name: string): string => {
  // Hidden control and direction-override characters never make it into a name.
  const normalized =
    type === 'text' ? normalizeTextChannelName(name) : name.replace(/[\p{Cc}\p{Cf}]/gu, '').trim()
  if (normalized.length === 0 || normalized.length > CHANNEL_NAME_MAX_LENGTH) {
    throw badRequest(
      'VALIDATION_FAILED',
      `Channel name must be 1-${CHANNEL_NAME_MAX_LENGTH} characters`,
    )
  }
  return normalized
}

export const createChannelService = ({
  db,
  channels,
  overwrites,
  roles,
  guilds,
  access,
  views,
  events,
  nextId,
  privatePermissions = async () => null,
  onVoiceChannelDeleted = async () => undefined,
  audit = NO_AUDIT,
  hasOthersMessages = async () => true,
}: ChannelServiceDeps) => {
  const publish = async (type: 'CHANNEL_CREATE' | 'CHANNEL_UPDATE', channel: ChannelRow) =>
    events.publish({ topic: guildTopic(channel.guildId), type, data: await views.channel(channel) })

  /** A parent must be a category in the same server; categories themselves stay top-level. */
  const assertParent = (
    type: ChannelType,
    parentId: Snowflake | null,
    byId: ReadonlyMap<Snowflake, ChannelRow>,
    selfId?: Snowflake,
  ) => {
    if (parentId === null) return
    const parent = byId.get(parentId)
    if (type === 'category' || !parent || parent.type !== 'category' || parent.id === selfId) {
      throw invalidParent()
    }
  }

  const loadGuildChannels = async (guildId: Snowflake) =>
    new Map((await channels.listByGuild(guildId)).map((channel) => [channel.id, channel]))

  /** A server channel the user can see; DMs answer 404 here (they have their own endpoints). */
  const resolveGuild = async (
    channelId: Snowflake,
    userId: Snowflake,
    flag?: bigint,
  ): Promise<ChannelAccess> => {
    const channel = await channels.findById(channelId)
    if (!channel || !isGuildChannel(channel)) throw unknownChannel()
    return access.requireChannel(channel, userId, flag)
  }

  /**
   * Any channel the user can see, a DM included (messages, reactions, files work in both),
   * optionally requiring a permission in it.
   */
  const resolve = async (
    channelId: Snowflake,
    userId: Snowflake,
    flag?: bigint,
  ): Promise<AnyChannelAccess> => {
    const channel = await channels.findById(channelId)
    if (!channel) throw unknownChannel()
    if (isGuildChannel(channel)) return access.requireChannel(channel, userId, flag)
    const permissions = (await privatePermissions(channel, userId)) ?? null
    if (permissions === null) throw unknownChannel()
    if (flag !== undefined && !has(permissions, flag)) {
      throw forbidden('MISSING_PERMISSIONS', 'Missing permissions')
    }
    return { access: null, channel, permissions }
  }

  return {
    resolve,
    resolveGuild,

    async create(
      guildId: Snowflake,
      userId: Snowflake,
      input: CreateChannelInput,
    ): Promise<Channel> {
      await access.requirePermission(guildId, userId, Permission.ManageChannels)
      assertParent(input.type, input.parentId, await loadGuildChannels(guildId))

      const channel = await db.transaction(async (tx) => {
        // Counted under a per-server lock so parallel creations can't pass the cap.
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`channels:${guildId}`}, 0))`,
        )
        const [existing] = await tx
          .select({ total: count() })
          .from(channelsTable)
          .where(and(eq(channelsTable.guildId, guildId), ne(channelsTable.type, 'thread')))
        if (Number(existing?.total ?? 0) >= MAX_CHANNELS_PER_GUILD) {
          throw badRequest('TOO_MANY_CHANNELS', 'This server has as many channels as allowed')
        }
        const repository = createChannelRepository(tx)
        const last = await repository.maxSiblingPosition(guildId, input.parentId)
        const [created] = await repository.insertMany([
          {
            id: nextId(),
            guildId,
            type: input.type,
            name: normalizeName(input.type, input.name),
            parentId: input.parentId,
            topic: input.topic || null,
            position: last === null ? 0 : last + 1,
          },
        ])
        return created as ChannelRow
      })
      // A new channel starts in sync with its category's permissions.
      if (input.parentId) {
        const inherited = await overwrites.listForChannel(input.parentId)
        await overwrites.insertMany(inherited.map((row) => ({ ...row, channelId: channel.id })))
      }
      await publish('CHANNEL_CREATE', channel)
      await audit.record({
        guildId,
        action: 'channel_create',
        actorId: userId,
        targetId: channel.id,
        data: { name: channel.name, type: channel.type },
      })
      return views.channel(channel)
    },

    async get(channelId: Snowflake, userId: Snowflake): Promise<Channel> {
      return views.channel((await resolveGuild(channelId, userId)).channel)
    },

    /** No access check: callers have already authorized the user for this server. */
    listForGuild: (guildId: Snowflake) => channels.listByGuild(guildId),

    async update(
      channelId: Snowflake,
      userId: Snowflake,
      changes: UpdateChannelRequest,
    ): Promise<Channel> {
      const { channel } = await resolveGuild(channelId, userId, Permission.ManageChannels)
      if (
        channel.type !== 'text' &&
        (changes.rateLimitPerUser !== undefined ||
          changes.nsfw !== undefined ||
          changes.announcement !== undefined)
      ) {
        throw badRequest(
          'INVALID_CHANNEL_OPTION',
          'Slowmode, NSFW and announcements apply to text channels',
        )
      }
      if (
        channel.type === 'thread' &&
        (changes.parentId !== undefined || changes.topic !== undefined)
      ) {
        throw badRequest('INVALID_CHANNEL_OPTION', 'A thread stays in its channel and has no topic')
      }
      if (changes.parentId !== undefined) {
        assertParent(
          channel.type,
          changes.parentId,
          await loadGuildChannels(channel.guildId),
          channel.id,
        )
      }
      const updated = await channels.update(channelId, {
        ...(changes.name !== undefined ? { name: normalizeName(channel.type, changes.name) } : {}),
        ...(changes.topic !== undefined ? { topic: changes.topic || null } : {}),
        ...(changes.parentId !== undefined ? { parentId: changes.parentId } : {}),
        ...(changes.rateLimitPerUser !== undefined
          ? { rateLimitPerUser: changes.rateLimitPerUser }
          : {}),
        ...(changes.nsfw !== undefined ? { nsfw: changes.nsfw } : {}),
        ...(changes.announcement !== undefined ? { announcement: changes.announcement } : {}),
      })
      await publish('CHANNEL_UPDATE', updated)
      // Threads follow their channel's slowmode and age restriction.
      if (
        channel.type === 'text' &&
        (changes.rateLimitPerUser !== undefined || changes.nsfw !== undefined)
      ) {
        const threads = await channels.setThreadPace(
          channel.id,
          updated.rateLimitPerUser,
          updated.nsfw,
        )
        for (const thread of threads) await publish('CHANNEL_UPDATE', thread)
      }
      await audit.record({
        guildId: channel.guildId,
        action: 'channel_update',
        actorId: userId,
        targetId: channel.id,
        data: { name: updated.name, changes: Object.keys(changes) },
      })
      return views.channel(updated)
    },

    async delete(channelId: Snowflake, userId: Snowflake): Promise<void> {
      const { channel, permissions } = await resolveGuild(channelId, userId)
      // Whoever started a thread may remove it while it holds only their own messages;
      // anything else needs MANAGE_CHANNELS (deleting others' words is moderation).
      const ownThread =
        channel.type === 'thread' &&
        channel.ownerId === userId &&
        !(await hasOthersMessages(channel.id, userId))
      if (!ownThread && !has(permissions, Permission.ManageChannels)) {
        throw forbidden('MISSING_PERMISSIONS', 'Missing permissions')
      }
      const children =
        channel.type === 'category'
          ? (await channels.listByGuild(channel.guildId)).filter((c) => c.parentId === channel.id)
          : []
      // A channel's threads go with it, in one transaction.
      const threads = await db.transaction(async (tx) => {
        const txChannels = createChannelRepository(tx)
        const owned = channel.type === 'text' ? await txChannels.listThreads(channel.id) : []
        for (const thread of owned) await txChannels.delete(thread.id)
        await txChannels.delete(channelId)
        return owned
      })
      for (const thread of threads) {
        await events.publish({
          topic: guildTopic(channel.guildId),
          type: 'CHANNEL_DELETE',
          data: { id: thread.id, guildId: channel.guildId },
        })
      }
      // The database moved a deleted category's channels to the top level.
      for (const child of children) await publish('CHANNEL_UPDATE', { ...child, parentId: null })
      await events.publish({
        topic: guildTopic(channel.guildId),
        type: 'CHANNEL_DELETE',
        data: { id: channel.id, guildId: channel.guildId },
      })
      if (channel.type === 'voice') await onVoiceChannelDeleted(channel.id, channel.guildId)
      await audit.record({
        guildId: channel.guildId,
        action: 'channel_delete',
        actorId: userId,
        targetId: channel.id,
        data: { name: channel.name, type: channel.type },
      })
    },

    /** Applies a drag-and-drop result: new positions (and parents) for many channels at once. */
    async reorder(
      guildId: Snowflake,
      userId: Snowflake,
      items: ReorderChannelsRequest,
    ): Promise<Channel[]> {
      const guildAccess = await access.requirePermission(guildId, userId, Permission.ManageChannels)
      const byId = await loadGuildChannels(guildId)

      for (const item of items) {
        const channel = byId.get(item.id)
        if (!channel) throw badRequest('UNKNOWN_CHANNEL', 'Channel does not belong to this server')
        if (channel.type === 'thread') throw invalidThreadTarget()
        if (item.parentId !== undefined) assertParent(channel.type, item.parentId, byId, channel.id)
      }

      await db.transaction(async (tx) => {
        const txChannels = createChannelRepository(tx)
        for (const item of items) {
          await txChannels.update(item.id, {
            position: item.position,
            ...(item.parentId !== undefined ? { parentId: item.parentId } : {}),
          })
        }
      })
      const touched = new Set(items.map((item) => item.id))
      for (const channel of await channels.listByGuild(guildId)) {
        if (touched.has(channel.id)) await publish('CHANNEL_UPDATE', channel)
      }
      return (await views.detail(guildAccess)).channels
    },

    ...createOverwriteOperations({
      db,
      overwrites,
      roles,
      guilds,
      access,
      views,
      resolveGuild,
      publish,
    }),
  }
}

export type ChannelService = ReturnType<typeof createChannelService>
