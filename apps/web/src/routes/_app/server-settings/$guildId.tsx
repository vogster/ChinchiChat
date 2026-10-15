import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, Outlet, createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { SettingsShell, settingsNavItemClass } from '../../../components/layout/settings-shell'
import { firstTextChannel } from '../../../features/guilds/channel-tree'
import { guildQueryOptions } from '../../../features/guilds/queries'
import { useGuildPermissions } from '../../../features/permissions/use-guild-permissions'
import { allowedSections } from '../../../features/server-settings/sections'
import { useApi } from '../../../lib/api-context'

const ServerSettingsLayout = () => {
  const { t } = useTranslation()
  const { guildId } = Route.useParams()
  const { data: guild } = useSuspenseQuery(guildQueryOptions(useApi(), guildId))
  const permissions = useGuildPermissions(guild)
  const channel = firstTextChannel(guild.channels)
  const back = channel ? `/channels/${guild.id}/${channel.id}` : `/channels/${guild.id}`

  const sections = allowedSections(permissions.base)

  return (
    <SettingsShell
      title={guild.name}
      closeLabel={t('serverSettings.close')}
      closeTo={back}
      nav={sections.map((section) => (
        <Link
          key={section}
          to={`/server-settings/$guildId/${section}`}
          params={{ guildId }}
          className={settingsNavItemClass}
        >
          {t(`serverSettings.nav.${section}`)}
        </Link>
      ))}
    >
      <Outlet />
    </SettingsShell>
  )
}

export const Route = createFileRoute('/_app/server-settings/$guildId')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(guildQueryOptions(context.api, params.guildId)),
  component: ServerSettingsLayout,
})
