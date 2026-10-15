import { Permission } from '@chinchi/shared'

import { can } from '../permissions/permissions'

export type ServerSettingsSection =
  'overview' | 'emojis' | 'roles' | 'members' | 'automod' | 'bans' | 'reports' | 'audit-log'

const SECTIONS: readonly { key: ServerSettingsSection; permission: bigint }[] = [
  { key: 'overview', permission: Permission.ManageGuild },
  { key: 'emojis', permission: Permission.ManageGuild },
  { key: 'roles', permission: Permission.ManageRoles },
  { key: 'members', permission: Permission.ManageRoles },
  { key: 'automod', permission: Permission.ManageGuild },
  { key: 'bans', permission: Permission.BanMembers },
  { key: 'reports', permission: Permission.ManageMessages },
  { key: 'audit-log', permission: Permission.ViewAuditLog },
]

/** The server settings sections someone with these server-wide permissions may open. */
export const allowedSections = (permissions: bigint): ServerSettingsSection[] =>
  SECTIONS.filter((section) => can(permissions, section.permission)).map((section) => section.key)
