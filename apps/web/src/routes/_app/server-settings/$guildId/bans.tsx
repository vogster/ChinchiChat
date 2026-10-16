import { Permission } from '@chinchi/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { guildQueryOptions } from '../../../../features/guilds/queries'
import { can } from '../../../../features/permissions/permissions'
import { useGuildPermissions } from '../../../../features/permissions/use-guild-permissions'
import { BansSection } from '../../../../features/server-settings/bans-section'
import { NoAccess } from '../../../../features/server-settings/no-access'
import { useApi } from '../../../../lib/api-context'

const BansPage = () => {
  const { guildId } = Route.useParams()
  const { data: guild } = useSuspenseQuery(guildQueryOptions(useApi(), guildId))
  const permissions = useGuildPermissions(guild)
  if (!can(permissions.base, Permission.BanMembers)) return <NoAccess />
  return <BansSection guildId={guild.id} />
}

export const Route = createFileRoute('/_app/server-settings/$guildId/bans')({
  component: BansPage,
})
