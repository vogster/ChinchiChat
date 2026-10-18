import {
  AuditLogPage,
  AutomodPage,
  BansPage,
  EmojisPage,
  MembersPage,
  OverviewPage,
  ReportsPage,
  RolesPage,
} from './server-settings-sections'

import type { ServerSettingsSection } from './sections'
import type { GuildDetail } from '@chinchi/shared'
import type { ComponentType } from 'react'

/** What each section of a server's settings shows (who may open it is in `sections.ts`). */
export const SERVER_SETTINGS_PAGES: Readonly<
  Record<ServerSettingsSection, ComponentType<{ guild: GuildDetail }>>
> = {
  overview: OverviewPage,
  emojis: EmojisPage,
  roles: RolesPage,
  members: MembersPage,
  automod: AutomodPage,
  bans: BansPage,
  reports: ReportsPage,
  'audit-log': AuditLogPage,
}
