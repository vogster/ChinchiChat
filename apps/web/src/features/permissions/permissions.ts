import {
  ALL_PERMISSIONS,
  canManageRole,
  computeBasePermissions,
  computeChannelPermissions,
  has,
  highestPosition,
  parsePermissions,
  Permission,
} from '@chinchi/shared'

import type { Channel, GuildDetail, PermissionContext, Role } from '@chinchi/shared'

/** Whether a timeout's end is still ahead (cached values outlive the timeout itself). */
export const isTimeoutRunning = (until: string | null): boolean =>
  until !== null && Date.parse(until) > Date.now()

/** Same computation as the server, from the data the client already has. */
export const permissionContext = (guild: GuildDetail, userId: string): PermissionContext => ({
  guildId: guild.id,
  ownerId: guild.ownerId,
  userId,
  memberRoleIds: guild.myRoleIds,
  // Only a timeout still in the future counts; the server checks the same way.
  timedOut: isTimeoutRunning(guild.myTimeoutUntil),
  // Removing the rules lets newcomers talk at once, before a fresh copy of the server arrives.
  pending: guild.myPending && guild.rules !== null,
  roles: guild.roles.map((role) => ({
    id: role.id,
    position: role.position,
    permissions: parsePermissions(role.permissions),
  })),
})

export const basePermissions = (guild: GuildDetail, userId: string): bigint =>
  computeBasePermissions(permissionContext(guild, userId))

export const channelPermissions = (guild: GuildDetail, channel: Channel, userId: string): bigint =>
  computeChannelPermissions(
    permissionContext(guild, userId),
    channel.permissionOverwrites.map((o) => ({
      targetType: o.targetType,
      targetId: o.targetId,
      allow: parsePermissions(o.allow),
      deny: parsePermissions(o.deny),
    })),
  )

export const can = (permissions: bigint, flag: bigint) => has(permissions, flag)

/** Whether a member with these roles is an administrator (whom timeouts don't touch). */
export const isAdministrator = (guild: GuildDetail, roleIds: readonly string[]): boolean =>
  guild.roles.some(
    (role) =>
      (role.id === guild.id || roleIds.includes(role.id)) &&
      has(parsePermissions(role.permissions), Permission.Administrator),
  )

/** Permissions the user may hand out: everything for owners and administrators. */
export const grantablePermissions = (guild: GuildDetail, userId: string): bigint => {
  const base = basePermissions(guild, userId)
  return guild.ownerId === userId || has(base, Permission.Administrator) ? ALL_PERMISSIONS : base
}

/** May the user edit, assign or delete this role (permission and hierarchy)? */
export const canManageGuildRole = (guild: GuildDetail, userId: string, role: Role): boolean =>
  canManageRole(permissionContext(guild, userId), role)

/**
 * May the user give this role to someone: manage it, and hold every permission it carries
 * (giving a role gives its permissions). The server checks the same.
 */
export const canAssignGuildRole = (guild: GuildDetail, userId: string, role: Role): boolean =>
  canManageGuildRole(guild, userId, role) &&
  (parsePermissions(role.permissions) & ~grantablePermissions(guild, userId)) === 0n

/**
 * May the user change this member's roles: their own, or a member below their highest role (the
 * owner: anyone's; nobody: the owner's). The server checks the same.
 */
export const canChangeMemberRoles = (
  guild: GuildDetail,
  userId: string,
  member: { readonly userId: string; readonly roleIds: readonly string[] },
): boolean => {
  if (member.userId === userId || guild.ownerId === userId) return true
  if (member.userId === guild.ownerId) return false
  const roles = permissionContext(guild, userId).roles
  return highestPosition(guild.myRoleIds, roles) > highestPosition(member.roleIds, roles)
}

/** Roles highest first, as Discord lists them. */
export const sortRoles = (roles: readonly Role[]): Role[] =>
  [...roles].sort((a, b) => b.position - a.position)

/** The colored role that decides how a member's name is painted (0 = default color). */
export const memberColor = (roles: readonly Role[], roleIds: readonly string[]): number => {
  const mine = new Set(roleIds)
  return sortRoles(roles).find((role) => mine.has(role.id) && role.color !== 0)?.color ?? 0
}

export const toHexColor = (color: number): string => `#${color.toString(16).padStart(6, '0')}`
