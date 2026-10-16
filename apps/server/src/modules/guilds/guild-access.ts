import { computeBasePermissions, computeChannelPermissions, has, Permission } from '@chinchi/shared'

import { forbidden, HttpError } from '../../http/http-error'

import type { AnyChannelRow, ChannelRow } from '../channels/channel.repository'
import type { OverwriteRepository, OverwriteRow } from '../roles/overwrite.repository'
import type { RoleRepository, RoleRow } from '../roles/role.repository'
import type { GuildRepository, GuildRow, MemberRow } from './guild.repository'
import type { PermissionContext, Snowflake } from '@chinchi/shared'

export interface GuildAccess {
  readonly guild: GuildRow
  readonly member: MemberRow
  readonly roles: readonly RoleRow[]
  readonly memberRoleIds: readonly Snowflake[]
  readonly isOwner: boolean
  readonly context: PermissionContext
  /** Server-wide permissions. */
  readonly permissions: bigint
}

export interface ChannelAccess {
  readonly access: GuildAccess
  readonly channel: ChannelRow
  readonly permissions: bigint
}

/** Access to a channel of any kind: DMs have no server access behind them. */
export interface AnyChannelAccess {
  readonly access: GuildAccess | null
  readonly channel: AnyChannelRow
  readonly permissions: bigint
}

export interface GuildAccessDeps {
  readonly guilds: GuildRepository
  readonly roles: RoleRepository
  readonly overwrites: OverwriteRepository
}

// Non-members (and members who cannot see a channel) get the same answer as for something that
// does not exist, so ids cannot be probed.
const unknownGuild = () => new HttpError(404, 'UNKNOWN_GUILD', 'Unknown server')
const unknownChannel = () => new HttpError(404, 'UNKNOWN_CHANNEL', 'Unknown channel')
const missing = () => forbidden('MISSING_PERMISSIONS', 'You do not have permission to do this')
/** A newcomer who has not accepted the rules yet is told why, so the app can ask them to. */
const denied = (access: GuildAccess) =>
  access.context.pending
    ? forbidden('RULES_NOT_ACCEPTED', 'Accept the server rules first')
    : missing()

export const toPermissionContext = (
  guild: GuildRow,
  userId: Snowflake,
  roles: readonly RoleRow[],
  memberRoleIds: readonly Snowflake[],
  timeoutUntil: Date | null = null,
  pending = false,
): PermissionContext => ({
  guildId: guild.id,
  ownerId: guild.ownerId,
  userId,
  memberRoleIds,
  // A timeout ends by itself: only one still in the future counts.
  timedOut: timeoutUntil !== null && timeoutUntil.getTime() > Date.now(),
  // Only while the server has rules: removing them lets everyone talk.
  pending: pending && guild.rules !== null,
  roles: roles.map((role) => ({
    id: role.id,
    position: role.position,
    permissions: role.permissions,
  })),
})

export const permissionsIn = (access: GuildAccess, overwrites: readonly OverwriteRow[]): bigint =>
  computeChannelPermissions(access.context, overwrites)

/** The single place where server and channel permissions are checked. */
export const createGuildAccess = ({ guilds, roles, overwrites }: GuildAccessDeps) => {
  const load = async (guildId: Snowflake, userId: Snowflake): Promise<GuildAccess> => {
    const [guild, member] = await Promise.all([
      guilds.findById(guildId),
      guilds.findMember(guildId, userId),
    ])
    if (!guild || !member) throw unknownGuild()
    const [guildRoles, memberRoleIds] = await Promise.all([
      roles.listByGuild(guildId),
      roles.memberRoleIds(guildId, userId),
    ])
    const context = toPermissionContext(
      guild,
      userId,
      guildRoles,
      memberRoleIds,
      member.timeoutUntil,
      member.pending,
    )
    return {
      guild,
      member,
      roles: guildRoles,
      memberRoleIds,
      isOwner: guild.ownerId === userId,
      context,
      permissions: computeBasePermissions(context),
    }
  }

  return {
    requireMember: load,

    async requirePermission(
      guildId: Snowflake,
      userId: Snowflake,
      flag: bigint,
    ): Promise<GuildAccess> {
      const access = await load(guildId, userId)
      if (!has(access.permissions, flag)) throw denied(access)
      return access
    },

    async requireOwner(guildId: Snowflake, userId: Snowflake): Promise<GuildAccess> {
      const access = await load(guildId, userId)
      if (!access.isOwner)
        throw forbidden('MISSING_PERMISSIONS', 'Only the server owner can do this')
      return access
    },

    /**
     * A channel the user can see (404 otherwise), optionally requiring a permission in it (403).
     * Non-members get 404 too.
     */
    async requireChannel(
      channel: ChannelRow,
      userId: Snowflake,
      flag?: bigint,
    ): Promise<ChannelAccess> {
      let access: GuildAccess
      try {
        access = await load(channel.guildId, userId)
      } catch (error) {
        if (error instanceof HttpError && error.code === 'UNKNOWN_GUILD') throw unknownChannel()
        throw error
      }
      const permissions = permissionsIn(access, await overwrites.listForChannel(channel.id))
      if (!has(permissions, Permission.ViewChannel)) throw unknownChannel()
      if (flag !== undefined && !has(permissions, flag)) throw denied(access)
      return { access, channel, permissions }
    },
  }
}

export type GuildAccessChecks = ReturnType<typeof createGuildAccess>
