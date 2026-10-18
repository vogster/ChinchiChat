import { Permission } from '@chinchi/shared'

import { can } from '../permissions/permissions'

export const SERVER_SETTINGS_SECTIONS = [
  'overview',
  'emojis',
  'roles',
  'members',
  'automod',
  'bans',
  'reports',
  'audit-log',
] as const

export type ServerSettingsSection = (typeof SERVER_SETTINGS_SECTIONS)[number]

export const isServerSettingsSection = (value: string): value is ServerSettingsSection =>
  (SERVER_SETTINGS_SECTIONS as readonly string[]).includes(value)

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
