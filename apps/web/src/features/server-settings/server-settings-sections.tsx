import { useApi } from '../../lib/api-context'
import { ReportsList } from '../reports/reports-list'
import { AuditLogSection } from './audit-log-section'
import { AutomodSection } from './automod-section'
import { BansSection } from './bans-section'
import { EmojisSection } from './emojis-section'
import { MembersSection } from './members-section'
import { OverviewSection } from './overview-section'
import { RolesSection } from './roles-section'

import type { GuildDetail } from '@chinchi/shared'

/** The sections of a server's settings, each given the server (see `server-settings-pages.ts`). */
type Props = { readonly guild: GuildDetail }

export const OverviewPage = ({ guild }: Props) => <OverviewSection guild={guild} />
export const EmojisPage = ({ guild }: Props) => <EmojisSection guild={guild} />
export const RolesPage = ({ guild }: Props) => <RolesSection guild={guild} />
export const MembersPage = ({ guild }: Props) => <MembersSection guild={guild} />
export const AutomodPage = ({ guild }: Props) => <AutomodSection guildId={guild.id} />
export const BansPage = ({ guild }: Props) => <BansSection guildId={guild.id} />
export const AuditLogPage = ({ guild }: Props) => <AuditLogSection guild={guild} />

export const ReportsPage = ({ guild }: Props) => {
  const api = useApi()
  return (
    <ReportsList
      scope={['guilds', guild.id]}
      load={(status) => api.reports.guild(guild.id, { status })}
      close={(reportId, status) => api.reports.closeGuild(guild.id, reportId, status)}
    />
  )
}
