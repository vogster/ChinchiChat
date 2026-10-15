import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Permission } from '@chinchi/shared'

import { guildQueryOptions } from '../../../../features/guilds/queries'
import { can } from '../../../../features/permissions/permissions'
import { useGuildPermissions } from '../../../../features/permissions/use-guild-permissions'
import { MembersSection } from '../../../../features/server-settings/members-section'
import { NoAccess } from '../../../../features/server-settings/no-access'
import { useApi } from '../../../../lib/api-context'

const MembersPage = () => {
  const { guildId } = Route.useParams()
  const { data: guild } = useSuspenseQuery(guildQueryOptions(useApi(), guildId))
  const permissions = useGuildPermissions(guild)
  if (!can(permissions.base, Permission.ManageRoles)) return <NoAccess />
  return <MembersSection guild={guild} />
}

export const Route = createFileRoute('/_app/server-settings/$guildId/members')({
  component: MembersPage,
})
