import { serializePermissions } from '@chinchi/shared'

import { profileImageUrl } from '../media/media-paths'
import { toPublicUser } from '../users/user.mapper'

import type { ChannelRow } from '../channels/channel.repository'
import type { OverwriteRow } from '../roles/overwrite.repository'
import type { RoleRow } from '../roles/role.repository'
import type { GuildRow, MemberWithUser } from './guild.repository'
import type { Channel, Guild, Member, PermissionOverwrite, Role } from '@chinchi/shared'

export const toGuild = (guild: GuildRow): Guild => ({
  id: guild.id,
  name: guild.name,
  iconUrl: profileImageUrl('icons', guild.id, guild.iconId),
  ownerId: guild.ownerId,
  createdAt: guild.createdAt.toISOString(),
  rules: guild.rules,
})

export const toOverwrite = (row: OverwriteRow): PermissionOverwrite => ({
  targetType: row.targetType,
  targetId: row.targetId,
  allow: serializePermissions(row.allow),
  deny: serializePermissions(row.deny),
})

export const toChannel = (
  channel: ChannelRow,
  overwrites: readonly OverwriteRow[] = [],
): Channel => ({
  id: channel.id,
  guildId: channel.guildId,
  type: channel.type,
  name: channel.name,
  topic: channel.topic,
  parentId: channel.parentId,
  position: channel.position,
  lastMessageId: channel.lastMessageId,
  permissionOverwrites: overwrites.map(toOverwrite),
  rateLimitPerUser: channel.rateLimitPerUser,
  nsfw: channel.nsfw,
  announcement: channel.announcement,
  threadStarterId: channel.threadStarterId,
  messageCount: channel.messageCount,
  ownerId: channel.ownerId,
})

export const toRole = (role: RoleRow): Role => ({
  id: role.id,
  guildId: role.guildId,
  name: role.name,
  color: role.color,
  position: role.position,
  permissions: serializePermissions(role.permissions),
  hoist: role.hoist,
  mentionable: role.mentionable,
})

export const toMember = (
  { member, user }: MemberWithUser,
  roleIds: readonly string[] = [],
): Member => ({
  user: toPublicUser(user),
  roleIds: [...roleIds],
  nickname: member.nickname,
  joinedAt: member.joinedAt.toISOString(),
  timeoutUntil: activeTimeout(member.timeoutUntil),
})

/** A timeout still running, as ISO; an ended one is no timeout. */
export const activeTimeout = (until: Date | null): string | null =>
  until && until.getTime() > Date.now() ? until.toISOString() : null
