/**
 * Permissions are a bit field (bigint), serialized as a decimal string in the API.
 * The computation follows Discord's well-understood model.
 */
export const Permission = {
  CreateInvite: 1n << 0n,
  KickMembers: 1n << 1n,
  BanMembers: 1n << 2n,
  /** Everything, everywhere; ignores channel overwrites. */
  Administrator: 1n << 3n,
  ManageChannels: 1n << 4n,
  ManageGuild: 1n << 5n,
  AddReactions: 1n << 6n,
  ViewAuditLog: 1n << 7n,
  ViewChannel: 1n << 8n,
  SendMessages: 1n << 9n,
  ManageMessages: 1n << 10n,
  EmbedLinks: 1n << 11n,
  AttachFiles: 1n << 12n,
  ReadMessageHistory: 1n << 13n,
  MentionEveryone: 1n << 14n,
  Connect: 1n << 15n,
  Speak: 1n << 16n,
  MuteMembers: 1n << 17n,
  DeafenMembers: 1n << 18n,
  MoveMembers: 1n << 19n,
  Video: 1n << 20n,
  ChangeNickname: 1n << 21n,
  ManageNicknames: 1n << 22n,
  /** Roles below one's own, and permission overwrites on channels. */
  ManageRoles: 1n << 23n,
  ModerateMembers: 1n << 24n,
} as const

export type PermissionName = keyof typeof Permission

export const ALL_PERMISSIONS = Object.values(Permission).reduce((all, flag) => all | flag, 0n)

/** Permissions that only make sense server-wide and cannot be overwritten per channel. */
const GUILD_ONLY =
  Permission.Administrator |
  Permission.ManageGuild |
  Permission.KickMembers |
  Permission.BanMembers |
  Permission.ViewAuditLog |
  Permission.ChangeNickname |
  Permission.ManageNicknames |
  Permission.ModerateMembers

export const CHANNEL_PERMISSIONS = ALL_PERMISSIONS & ~GUILD_ONLY

export const DEFAULT_EVERYONE_PERMISSIONS =
  Permission.CreateInvite |
  Permission.ViewChannel |
  Permission.SendMessages |
  Permission.ReadMessageHistory |
  Permission.AddReactions |
  Permission.EmbedLinks |
  Permission.AttachFiles |
  Permission.ChangeNickname |
  Permission.Connect |
  Permission.Speak |
  Permission.Video

export const has = (permissions: bigint, flag: bigint): boolean => (permissions & flag) === flag

export const serializePermissions = (permissions: bigint): string => permissions.toString()

/** Parses an API value; anything malformed or unknown is dropped rather than granted. */
export const parsePermissions = (value: string): bigint => {
  if (!/^\d{1,20}$/.test(value)) return 0n
  return BigInt(value) & ALL_PERMISSIONS
}

export interface RoleLike {
  readonly id: string
  readonly position: number
  readonly permissions: bigint
}

export interface OverwriteLike {
  readonly targetType: 'role' | 'member'
  readonly targetId: string
  readonly allow: bigint
  readonly deny: bigint
}

export interface PermissionContext {
  readonly guildId: string
  readonly ownerId: string
  readonly userId: string
  readonly memberRoleIds: readonly string[]
  /** All roles of the server; the @everyone role has the server's id. */
  readonly roles: readonly RoleLike[]
  /** A moderator's timeout is running: the member may only look and read. */
  readonly timedOut?: boolean
  /** Joined a server with rules and has not accepted them: may only look and read, too. */
  readonly pending?: boolean
}

/** What a timed-out member keeps: seeing channels and reading what was said. */
const TIMED_OUT_ALLOWED = Permission.ViewChannel | Permission.ReadMessageHistory

/** Server-wide permissions: @everyone plus the member's roles. */
export const computeBasePermissions = ({
  guildId,
  ownerId,
  userId,
  memberRoleIds,
  roles,
  timedOut = false,
  pending = false,
}: PermissionContext): bigint => {
  if (userId === ownerId) return ALL_PERMISSIONS
  const mine = new Set(memberRoleIds)
  const permissions = roles
    .filter((role) => role.id === guildId || mine.has(role.id))
    .reduce((acc, role) => acc | role.permissions, 0n)
  // Administrators are above timeouts, like the owner.
  if (has(permissions, Permission.Administrator)) return ALL_PERMISSIONS
  return timedOut || pending ? permissions & TIMED_OUT_ALLOWED : permissions
}

const apply = (permissions: bigint, allow: bigint, deny: bigint) => (permissions & ~deny) | allow

/**
 * Permissions in one channel: base, then the @everyone overwrite, then all of the member's role
 * overwrites combined, then the member's own overwrite.
 */
export const computeChannelPermissions = (
  context: PermissionContext,
  overwrites: readonly OverwriteLike[],
): bigint => {
  const base = computeBasePermissions(context)
  if (has(base, Permission.Administrator)) return ALL_PERMISSIONS

  const roleOverwrite = (id: string) =>
    overwrites.find((o) => o.targetType === 'role' && o.targetId === id)
  const everyone = roleOverwrite(context.guildId)
  let permissions = everyone ? apply(base, everyone.allow, everyone.deny) : base

  const mine = new Set(context.memberRoleIds)
  const roles = overwrites.filter(
    (o) => o.targetType === 'role' && o.targetId !== context.guildId && mine.has(o.targetId),
  )
  permissions = apply(
    permissions,
    roles.reduce((acc, o) => acc | o.allow, 0n),
    roles.reduce((acc, o) => acc | o.deny, 0n),
  )

  const member = overwrites.find((o) => o.targetType === 'member' && o.targetId === context.userId)
  if (member) permissions = apply(permissions, member.allow, member.deny)

  // Implicit rules: what you cannot see you cannot use; what depends on sending needs sending.
  if (!has(permissions, Permission.ViewChannel)) return 0n
  if (!has(permissions, Permission.SendMessages)) {
    permissions &= ~(Permission.MentionEveryone | Permission.AttachFiles | Permission.EmbedLinks)
  }
  if (!has(permissions, Permission.Connect)) {
    permissions &= ~(
      Permission.Speak |
      Permission.Video |
      Permission.MuteMembers |
      Permission.DeafenMembers |
      Permission.MoveMembers
    )
  }
  if (context.timedOut || context.pending) permissions &= TIMED_OUT_ALLOWED
  return permissions & CHANNEL_PERMISSIONS
}

export const highestPosition = (
  memberRoleIds: readonly string[],
  roles: readonly RoleLike[],
): number => {
  const mine = new Set(memberRoleIds)
  return roles
    .filter((role) => mine.has(role.id))
    .reduce((max, role) => Math.max(max, role.position), 0)
}

/** May the member edit, assign or delete this role? Only roles strictly below their own highest. */
export const canManageRole = (
  context: PermissionContext,
  role: Pick<RoleLike, 'position'>,
): boolean => {
  if (context.userId === context.ownerId) return true
  if (!has(computeBasePermissions(context), Permission.ManageRoles)) return false
  return role.position < highestPosition(context.memberRoleIds, context.roles)
}
