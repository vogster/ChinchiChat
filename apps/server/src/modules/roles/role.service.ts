import {
  ALL_PERMISSIONS,
  canManageRole,
  has,
  highestPosition,
  parsePermissions,
  Permission,
} from '@chinchi/shared'

import { guildTopic } from '../../events/event-bus'
import { badRequest, forbidden, HttpError } from '../../http/http-error'
import { isGuildChannel } from '../channels/channel.repository'
import { toRole } from '../guilds/guild.mapper'
import { activeTimeout } from '../guilds/guild.mapper'
import { outranks } from '../guilds/outranks'

import type { EventBus } from '../../events/event-bus'
import type { ChannelRepository } from '../channels/channel.repository'
import type { GuildRepository } from '../guilds/guild.repository'
import type { GuildAccess, GuildAccessChecks } from '../guilds/guild-access'
import type { GuildViews } from '../guilds/guild-views'
import type { AuditLogService } from '../moderation/audit-log.service'
import type { OverwriteRepository } from './overwrite.repository'
import type { RoleRepository, RoleRow } from './role.repository'
import type {
  createRoleRequestSchema,
  ReorderRolesRequest,
  Role,
  Snowflake,
  UpdateRoleRequest,
} from '@chinchi/shared'
import type { z } from 'zod'

type CreateRoleInput = z.output<typeof createRoleRequestSchema>

const NO_AUDIT: Pick<AuditLogService, 'record'> = { record: async () => undefined }

export interface RoleServiceDeps {
  readonly roles: RoleRepository
  readonly overwrites: OverwriteRepository
  readonly channels: ChannelRepository
  readonly guilds: GuildRepository
  readonly access: GuildAccessChecks
  readonly views: GuildViews
  readonly events: EventBus
  readonly nextId: () => Snowflake
  /** Writes moderation and settings changes to the server's audit log. */
  readonly audit?: Pick<AuditLogService, 'record'>
}

const unknownRole = () => new HttpError(404, 'UNKNOWN_ROLE', 'Unknown role')
const unknownMember = () =>
  new HttpError(404, 'UNKNOWN_MEMBER', 'That user is not a member of this server')
const hierarchy = () =>
  forbidden('ROLE_HIERARCHY', 'You can only manage roles below your highest role')
const invalidEveryone = (what: string) =>
  badRequest('INVALID_ROLE', `The @everyone role cannot be ${what}`)

/** Owners and administrators may hand out anything; others only what they have. */
const grantable = (actor: GuildAccess): bigint =>
  actor.isOwner || has(actor.permissions, Permission.Administrator)
    ? ALL_PERMISSIONS
    : actor.permissions

export const createRoleService = ({
  roles,
  overwrites,
  channels,
  guilds,
  access,
  views,
  events,
  nextId,
  audit = NO_AUDIT,
}: RoleServiceDeps) => {
  const publish = (type: 'GUILD_ROLE_CREATE' | 'GUILD_ROLE_UPDATE', role: RoleRow) =>
    events.publish({
      topic: guildTopic(role.guildId),
      type,
      data: { guildId: role.guildId, role: toRole(role) },
    })

  const publishMemberRoles = async (guildId: Snowflake, userId: Snowflake) => {
    const [roleIds, member] = await Promise.all([
      roles.memberRoleIds(guildId, userId),
      guilds.findMember(guildId, userId),
    ])
    await events.publish({
      topic: guildTopic(guildId),
      type: 'GUILD_MEMBER_UPDATE',
      data: {
        guildId,
        userId,
        roleIds,
        nickname: member?.nickname ?? null,
        timeoutUntil: activeTimeout(member?.timeoutUntil ?? null),
      },
    })
  }

  const assertGrantable = (actor: GuildAccess, permissions: bigint) => {
    if ((permissions & ~grantable(actor)) !== 0n) {
      throw forbidden('MISSING_PERMISSIONS', 'You can only grant permissions you have')
    }
  }

  /**
   * Whose roles the caller may change: their own, or a member below their highest role (the
   * owner: anyone). Without it, a manager could strip a senior of a role or pin one on them.
   */
  const assertChangeable = async (
    guildId: Snowflake,
    actor: GuildAccess,
    actorId: Snowflake,
    targetId: Snowflake,
  ) => {
    if (targetId === actorId) return
    const target = await access.requireMember(guildId, targetId).catch((error: unknown) => {
      if (error instanceof HttpError) throw unknownMember()
      throw error
    })
    if (!outranks(actor, target)) {
      throw forbidden('ROLE_HIERARCHY', 'You can only change the roles of members below you')
    }
  }

  /** A role of this server that the caller may manage (by permission and hierarchy). */
  const manageable = async (guildId: Snowflake, roleId: Snowflake, userId: Snowflake) => {
    const actor = await access.requirePermission(guildId, userId, Permission.ManageRoles)
    const role = await roles.findInGuild(guildId, roleId)
    if (!role) throw unknownRole()
    if (!canManageRole(actor.context, role)) throw hierarchy()
    return { actor, role }
  }

  return {
    async list(guildId: Snowflake, userId: Snowflake): Promise<Role[]> {
      await access.requireMember(guildId, userId)
      return (await roles.listByGuild(guildId)).map(toRole)
    },

    /** New roles land just above @everyone; every other role moves up by one. */
    async create(guildId: Snowflake, userId: Snowflake, input: CreateRoleInput): Promise<Role> {
      const actor = await access.requirePermission(guildId, userId, Permission.ManageRoles)
      const permissions = parsePermissions(input.permissions)
      assertGrantable(actor, permissions)

      const shifted = actor.roles
        .filter((role) => role.position >= 1)
        .map((role) => ({ id: role.id, position: role.position + 1 }))
      await roles.setPositions(guildId, shifted)
      const created = await roles.insert({
        id: nextId(),
        guildId,
        name: input.name,
        color: input.color,
        position: 1,
        permissions,
        hoist: input.hoist,
        mentionable: input.mentionable,
      })
      await publish('GUILD_ROLE_CREATE', created)
      for (const role of await roles.listByGuild(guildId)) {
        if (shifted.some((s) => s.id === role.id)) await publish('GUILD_ROLE_UPDATE', role)
      }
      await audit.record({
        guildId,
        action: 'role_create',
        actorId: userId,
        targetId: created.id,
        data: { name: created.name },
      })
      return toRole(created)
    },

    async update(
      guildId: Snowflake,
      roleId: Snowflake,
      userId: Snowflake,
      changes: UpdateRoleRequest,
    ): Promise<Role> {
      const { actor, role } = await manageable(guildId, roleId, userId)
      const isEveryone = role.id === guildId
      if (isEveryone && changes.name !== undefined) throw invalidEveryone('renamed')

      let permissions: bigint | undefined
      if (changes.permissions !== undefined) {
        permissions = parsePermissions(changes.permissions)
        // Only newly added bits need to be grantable; keeping what is already there is fine.
        assertGrantable(actor, permissions & ~role.permissions)
      }
      const updated = await roles.update(roleId, {
        ...(changes.name !== undefined ? { name: changes.name } : {}),
        ...(changes.color !== undefined ? { color: changes.color } : {}),
        ...(changes.hoist !== undefined ? { hoist: changes.hoist } : {}),
        ...(changes.mentionable !== undefined ? { mentionable: changes.mentionable } : {}),
        ...(permissions !== undefined ? { permissions } : {}),
      })
      await publish('GUILD_ROLE_UPDATE', updated)
      await audit.record({
        guildId,
        action: 'role_update',
        actorId: userId,
        targetId: roleId,
        data: { name: updated.name, changes: Object.keys(changes) },
      })
      return toRole(updated)
    },

    async delete(guildId: Snowflake, roleId: Snowflake, userId: Snowflake): Promise<void> {
      if (roleId === guildId) throw invalidEveryone('deleted')
      const { role } = await manageable(guildId, roleId, userId)
      const holders = await roles.holders(roleId)
      const affectedChannels = await overwrites.deleteForTarget(roleId)
      await roles.delete(roleId)

      await events.publish({
        topic: guildTopic(guildId),
        type: 'GUILD_ROLE_DELETE',
        data: { guildId, roleId },
      })
      for (const holder of holders) await publishMemberRoles(guildId, holder)
      await audit.record({
        guildId,
        action: 'role_delete',
        actorId: userId,
        targetId: roleId,
        data: { name: role.name },
      })
      for (const channelId of new Set(affectedChannels)) {
        const channel = await channels.findById(channelId)
        if (channel && isGuildChannel(channel)) {
          await events.publish({
            topic: guildTopic(guildId),
            type: 'CHANNEL_UPDATE',
            data: await views.channel(channel),
          })
        }
      }
    },

    /** Moves roles; nobody but the owner may move a role to or above their own highest. */
    async reorder(
      guildId: Snowflake,
      userId: Snowflake,
      items: ReorderRolesRequest,
    ): Promise<Role[]> {
      const actor = await access.requirePermission(guildId, userId, Permission.ManageRoles)
      const ceiling = actor.isOwner
        ? Number.POSITIVE_INFINITY
        : highestPosition(actor.memberRoleIds, actor.roles)
      for (const item of items) {
        const role = actor.roles.find((r) => r.id === item.id)
        if (!role) throw unknownRole()
        if (role.id === guildId) throw invalidEveryone('moved')
        if (!canManageRole(actor.context, role) || item.position >= ceiling) throw hierarchy()
      }
      await roles.setPositions(guildId, items)
      const after = await roles.listByGuild(guildId)
      for (const role of after)
        if (items.some((item) => item.id === role.id)) await publish('GUILD_ROLE_UPDATE', role)
      return after.map(toRole)
    },

    async addToMember(
      guildId: Snowflake,
      targetId: Snowflake,
      roleId: Snowflake,
      userId: Snowflake,
    ): Promise<void> {
      if (roleId === guildId) throw invalidEveryone('assigned')
      const { actor, role } = await manageable(guildId, roleId, userId)
      // Giving a role gives its permissions: only those the caller could grant themselves.
      // New roles land at the bottom, so position alone would let a manager take Administrator.
      assertGrantable(actor, role.permissions)
      await assertChangeable(guildId, actor, userId, targetId)
      if (!(await guilds.findMember(guildId, targetId))) throw unknownMember()
      await roles.addMemberRole(guildId, targetId, roleId)
      await publishMemberRoles(guildId, targetId)
      await audit.record({
        guildId,
        action: 'member_role_add',
        actorId: userId,
        targetUserId: targetId,
        targetId: roleId,
      })
    },

    async removeFromMember(
      guildId: Snowflake,
      targetId: Snowflake,
      roleId: Snowflake,
      userId: Snowflake,
    ): Promise<void> {
      if (roleId === guildId) throw invalidEveryone('removed')
      const { actor } = await manageable(guildId, roleId, userId)
      await assertChangeable(guildId, actor, userId, targetId)
      await roles.removeMemberRole(guildId, targetId, roleId)
      await publishMemberRoles(guildId, targetId)
      await audit.record({
        guildId,
        action: 'member_role_remove',
        actorId: userId,
        targetUserId: targetId,
        targetId: roleId,
      })
    },
  }
}

export type RoleService = ReturnType<typeof createRoleService>
