import { Permission } from '@chinchi/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { guildQueryOptions } from '../../../../features/guilds/queries'
import { can } from '../../../../features/permissions/permissions'
import { useGuildPermissions } from '../../../../features/permissions/use-guild-permissions'
import { ReportsList } from '../../../../features/reports/reports-list'
import { NoAccess } from '../../../../features/server-settings/no-access'
import { useApi } from '../../../../lib/api-context'

const ReportsPage = () => {
  const { guildId } = Route.useParams()
  const api = useApi()
  const { data: guild } = useSuspenseQuery(guildQueryOptions(api, guildId))
  const permissions = useGuildPermissions(guild)
  if (!can(permissions.base, Permission.ManageMessages)) return <NoAccess />
  return (
    <ReportsList
      scope={['guilds', guildId]}
      load={(status) => api.reports.guild(guildId, { status })}
      close={(reportId, status) => api.reports.closeGuild(guildId, reportId, status)}
    />
  )
}

export const Route = createFileRoute('/_app/server-settings/$guildId/reports')({
  component: ReportsPage,
})
