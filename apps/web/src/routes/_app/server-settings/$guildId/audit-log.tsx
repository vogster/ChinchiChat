import { Permission } from '@chinchi/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { guildQueryOptions } from '../../../../features/guilds/queries'
import { can } from '../../../../features/permissions/permissions'
import { useGuildPermissions } from '../../../../features/permissions/use-guild-permissions'
import { AuditLogSection } from '../../../../features/server-settings/audit-log-section'
import { NoAccess } from '../../../../features/server-settings/no-access'
import { useApi } from '../../../../lib/api-context'

const AuditLogPage = () => {
  const { guildId } = Route.useParams()
  const { data: guild } = useSuspenseQuery(guildQueryOptions(useApi(), guildId))
  const permissions = useGuildPermissions(guild)
  if (!can(permissions.base, Permission.ViewAuditLog)) return <NoAccess />
  return <AuditLogSection guild={guild} />
}

export const Route = createFileRoute('/_app/server-settings/$guildId/audit-log')({
  component: AuditLogPage,
})
