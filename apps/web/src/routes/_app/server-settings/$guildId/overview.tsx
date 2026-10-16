import { Permission } from '@chinchi/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { guildQueryOptions } from '../../../../features/guilds/queries'
import { can } from '../../../../features/permissions/permissions'
import { useGuildPermissions } from '../../../../features/permissions/use-guild-permissions'
import { NoAccess } from '../../../../features/server-settings/no-access'
import { OverviewSection } from '../../../../features/server-settings/overview-section'
import { useApi } from '../../../../lib/api-context'

const OverviewPage = () => {
  const { guildId } = Route.useParams()
  const { data: guild } = useSuspenseQuery(guildQueryOptions(useApi(), guildId))
  const permissions = useGuildPermissions(guild)
  if (!can(permissions.base, Permission.ManageGuild)) return <NoAccess />
  return <OverviewSection guild={guild} />
}

export const Route = createFileRoute('/_app/server-settings/$guildId/overview')({
  component: OverviewPage,
})
