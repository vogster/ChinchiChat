import { CHANNEL_PERMISSIONS, Permission, has } from '@chinchi/shared'

import type { ChannelType, PermissionName } from '@chinchi/shared'

export interface PermissionGroup {
  readonly key: 'general' | 'members' | 'text' | 'voice' | 'advanced'
  readonly permissions: readonly PermissionName[]
}

/** How permissions are grouped in role and channel settings. */
export const PERMISSION_GROUPS: readonly PermissionGroup[] = [
  {
    key: 'general',
    permissions: ['ViewChannel', 'ManageChannels', 'ManageRoles', 'ManageGuild', 'ViewAuditLog'],
  },
  {
    key: 'members',
    permissions: [
      'CreateInvite',
      'ChangeNickname',
      'ManageNicknames',
      'KickMembers',
      'BanMembers',
      'ModerateMembers',
    ],
  },
  {
    key: 'text',
    permissions: [
      'SendMessages',
      'EmbedLinks',
      'AttachFiles',
      'AddReactions',
      'MentionEveryone',
      'ManageMessages',
      'ReadMessageHistory',
    ],
  },
  {
    key: 'voice',
    permissions: ['Connect', 'Speak', 'Video', 'MuteMembers', 'DeafenMembers', 'MoveMembers'],
  },
  { key: 'advanced', permissions: ['Administrator'] },
]

const irrelevant: Readonly<Record<ChannelType, readonly PermissionGroup['key'][]>> = {
  text: ['voice'],
  voice: ['text'],
  category: [],
  // Threads take their channel's permissions; listed only for completeness.
  thread: ['voice'],
}

/** Groups that can be overwritten in a channel of this type (server-only permissions removed). */
export const channelPermissionGroups = (type: ChannelType): PermissionGroup[] =>
  PERMISSION_GROUPS.filter((group) => !irrelevant[type].includes(group.key))
    .map((group) => ({
      ...group,
      permissions: group.permissions.filter((name) => has(CHANNEL_PERMISSIONS, Permission[name])),
    }))
    .filter((group) => group.permissions.length > 0)
