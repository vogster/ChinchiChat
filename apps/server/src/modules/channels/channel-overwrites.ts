import {
  CHANNEL_PERMISSIONS,
  Permission,
  has,
  highestPosition,
  parsePermissions,
} from '@chinchi/shared'

import { badRequest, forbidden } from '../../http/http-error'
import { outranks } from '../guilds/outranks'
import { createOverwriteRepository } from '../roles/overwrite.repository'
import { createChannelRepository, lockChannel } from './channel.repository'

import type { Database } from '../../db/client'
import type { ChannelAccess, GuildAccess, GuildAccessChecks } from '../guilds/guild-access'
import type { GuildRepository } from '../guilds/guild.repository'
import type { GuildViews } from '../guilds/guild-views'
import type { OverwriteRepository } from '../roles/overwrite.repository'
import type { RoleRepository } from '../roles/role.repository'
import type { ChannelRow } from './channel.repository'
import type { Channel, PutOverwriteRequest, Snowflake } from '@chinchi/shared'

export const invalidThreadTarget = () =>
  badRequest('INVALID_CHANNEL', "A thread follows its channel's permissions and place")

const outranked = () =>
  forbidden('ROLE_HIERARCHY', 'You can only change permissions of roles and members below you')

export interface OverwriteOperationsDeps {
  readonly db: Database
  readonly overwrites: OverwriteRepository
  readonly roles: RoleRepository
  readonly guilds: GuildRepository
  readonly access: GuildAccessChecks
  readonly views: GuildViews
  /** A server channel the user can see with the given permission in it (the channel service's). */
  readonly resolveGuild: (
    channelId: Snowflake,
    userId: Snowflake,
    flag?: bigint,
  ) => Promise<ChannelAccess>
  readonly publish: (type: 'CHANNEL_UPDATE', channel: ChannelRow) => Promise<unknown>
}

/**
 * Permission overwrites of a channel: setting, syncing with the category and removing them.
 * Part of the channel service, kept apart because the rules around who may change what are
 * a chapter of their own.
 */
export const createOverwriteOperations = ({
  db,
  overwrites,
  roles,
  guilds,
  access,
  views,
  resolveGuild,
  publish,
}: OverwriteOperationsDeps) => {
  /**
   * Changes a channel's permissions and copies them to its threads, all under the channel's
   * row lock, so a thread created (or another change made) meanwhile can't keep stale ones.
   * Returns the threads to announce once committed.
   */
  const changeOverwrites = async (
    channel: ChannelRow,
    change: (txOverwrites: ReturnType<typeof createOverwriteRepository>) => Promise<boolean>,
  ): Promise<{ changed: boolean; threads: ChannelRow[] }> =>
    db.transaction(async (tx) => {
      await lockChannel(tx, channel.id)
      const txOverwrites = createOverwriteRepository(tx)
      if (!(await change(txOverwrites))) return { changed: false, threads: [] }
      if (channel.type !== 'text') return { changed: true, threads: [] }
      const threads = await createChannelRepository(tx).listThreads(channel.id)
      const rows = await txOverwrites.listForChannel(channel.id)
      for (const thread of threads) await txOverwrites.replaceForChannel(thread.id, rows)
      return { changed: true, threads }
    })

  /**
   * Changing an overwrite: every bit that changes (added or lifted) must be one the caller
   * holds, and the target must rank below them, so nobody unmutes themselves or limits a
   * senior. The owner and administrators may do anything.
   */
  const assertMayChangeOverwrite = async (
    channel: ChannelRow,
    actor: GuildAccess,
    permissions: bigint,
    targetType: 'role' | 'member',
    targetId: Snowflake,
    next: { allow: bigint; deny: bigint },
  ) => {
    if (actor.isOwner || has(actor.permissions, Permission.Administrator)) return
    const current = (await overwrites.listForChannel(channel.id)).find(
      (row) => row.targetId === targetId,
    )
    const changed = ((current?.allow ?? 0n) ^ next.allow) | ((current?.deny ?? 0n) ^ next.deny)
    if ((changed & ~permissions) !== 0n) {
      throw forbidden('MISSING_PERMISSIONS', 'You can only change permissions you have')
    }
    if (targetType === 'role') {
      const role = actor.roles.find((r) => r.id === targetId)
      const ceiling = highestPosition(actor.memberRoleIds, actor.roles)
      if (role && role.id !== channel.guildId && role.position >= ceiling) throw outranked()
      return
    }
    const target = await access.requireMember(channel.guildId, targetId).catch(() => null)
    if (!target || !outranks(actor, target)) throw outranked()
  }

  const announce = async (channel: ChannelRow, threads: readonly ChannelRow[]) => {
    await publish('CHANNEL_UPDATE', channel)
    for (const thread of threads) await publish('CHANNEL_UPDATE', thread)
  }

  return {
    /**
     * Sets a role's or member's allow/deny in a channel. Requires MANAGE_ROLES there, and one can
     * only grant or take away permissions one has in that channel.
     */
    async putOverwrite(
      channelId: Snowflake,
      targetId: Snowflake,
      userId: Snowflake,
      body: PutOverwriteRequest,
    ): Promise<Channel> {
      const {
        channel,
        access: actor,
        permissions,
      } = await resolveGuild(channelId, userId, Permission.ManageRoles)
      if (channel.type === 'thread') throw invalidThreadTarget()
      const target =
        body.targetType === 'role'
          ? await roles.findInGuild(channel.guildId, targetId)
          : await guilds.findMember(channel.guildId, targetId)
      if (!target) throw badRequest('UNKNOWN_TARGET', 'No such role or member in this server')

      const allow = parsePermissions(body.allow) & CHANNEL_PERMISSIONS
      const deny = parsePermissions(body.deny) & CHANNEL_PERMISSIONS & ~allow
      await assertMayChangeOverwrite(channel, actor, permissions, body.targetType, targetId, {
        allow,
        deny,
      })

      const { threads } = await changeOverwrites(channel, async (txOverwrites) => {
        await txOverwrites.upsert({
          channelId,
          targetType: body.targetType,
          targetId,
          allow,
          deny,
        })
        return true
      })
      await announce(channel, threads)
      return views.channel(channel)
    },

    /** Replaces the channel's overwrites with its category's (what new channels start with). */
    async syncWithCategory(channelId: Snowflake, userId: Snowflake): Promise<Channel> {
      const {
        channel,
        access: actor,
        permissions,
      } = await resolveGuild(channelId, userId, Permission.ManageRoles)
      if (channel.type === 'thread') throw invalidThreadTarget()
      if (!channel.parentId) throw badRequest('NO_CATEGORY', 'This channel is not in a category')
      const [current, wanted] = await Promise.all([
        overwrites.listForChannel(channel.id),
        overwrites.listForChannel(channel.parentId),
      ])
      // Every overwrite that changes goes through the same rules as changing it by hand.
      const targets = new Map(
        [...current, ...wanted].map((row) => [row.targetId, row.targetType] as const),
      )
      for (const [targetId, targetType] of targets) {
        const next = wanted.find((row) => row.targetId === targetId)
        const now = current.find((row) => row.targetId === targetId)
        if (next?.allow === now?.allow && next?.deny === now?.deny) continue
        await assertMayChangeOverwrite(channel, actor, permissions, targetType, targetId, {
          allow: next?.allow ?? 0n,
          deny: next?.deny ?? 0n,
        })
      }
      const { threads } = await changeOverwrites(channel, async (txOverwrites) => {
        await txOverwrites.replaceForChannel(
          channel.id,
          wanted.map((row) => ({ ...row, channelId: channel.id })),
        )
        return true
      })
      await announce(channel, threads)
      return views.channel(channel)
    },

    async deleteOverwrite(
      channelId: Snowflake,
      targetId: Snowflake,
      userId: Snowflake,
    ): Promise<void> {
      const {
        channel,
        access: actor,
        permissions,
      } = await resolveGuild(channelId, userId, Permission.ManageRoles)
      if (channel.type === 'thread') throw invalidThreadTarget()
      const existing = (await overwrites.listForChannel(channelId)).find(
        (row) => row.targetId === targetId,
      )
      if (existing) {
        await assertMayChangeOverwrite(channel, actor, permissions, existing.targetType, targetId, {
          allow: 0n,
          deny: 0n,
        })
      }
      const { changed, threads } = await changeOverwrites(channel, (txOverwrites) =>
        txOverwrites.delete(channelId, targetId),
      )
      if (changed) await announce(channel, threads)
    },
  }
}
