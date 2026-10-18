import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { settingsNavItemClass } from '../../components/layout/settings-shell'
import { SettingsWindow } from '../../components/layout/settings-window'
import { useApi } from '../../lib/api-context'
import { GuildIcon } from '../guilds/guild-icon'
import { guildQueryOptions } from '../guilds/queries'
import { useGuildPermissions } from '../permissions/use-guild-permissions'
import { NoAccess } from './no-access'
import { allowedSections } from './sections'
import { SERVER_SETTINGS_PAGES } from './server-settings-pages'
import { withServerSettings } from './server-settings-search'

import type { ServerSettingsSearch } from './server-settings-search'
import type { GuildDetail } from '@chinchi/shared'

const Window = ({
  guild,
  section,
}: {
  guild: GuildDetail
  section: ServerSettingsSearch['serverSection']
}) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const sections = allowedSections(useGuildPermissions(guild).base)
  const current = section ?? sections[0]
  const Page = current && sections.includes(current) ? SERVER_SETTINGS_PAGES[current] : null

  return (
    <SettingsWindow
      title={t('serverSettings.title')}
      navLabel={guild.name}
      closeLabel={t('serverSettings.close')}
      onClose={() => void navigate({ to: '.', search: withServerSettings(undefined) })}
      wide
      nav={
        <>
          <div className="flex items-center gap-2.5 px-2 pb-3 max-md:hidden">
            <span className="size-10 shrink-0 overflow-hidden rounded-[14px]">
              <GuildIcon id={guild.id} name={guild.name} iconUrl={guild.iconUrl} />
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{guild.name}</div>
              <div className="truncate text-xs text-faint">{t('serverSettings.title')}</div>
            </div>
          </div>
          {sections.map((key) => (
            <Link
              key={key}
              to="."
              search={withServerSettings(guild.id, key)}
              aria-current={key === current ? 'page' : undefined}
              data-status={key === current ? 'active' : undefined}
              className={settingsNavItemClass}
            >
              {t(`serverSettings.nav.${key}`)}
            </Link>
          ))}
        </>
      }
    >
      {Page ? <Page guild={guild} /> : <NoAccess />}
    </SettingsWindow>
  )
}

/**
 * A server's settings as a window over the chat (full screen on a phone). Which server and
 * section are open lives in the URL (`?serverSettings=`), like the user settings.
 */
export const ServerSettingsDialog = () => {
  const { serverSettings, serverSection } = useSearch({ strict: false }) as ServerSettingsSearch
  const { data: guild } = useQuery({
    ...guildQueryOptions(useApi(), serverSettings ?? ''),
    enabled: serverSettings !== undefined,
  })
  if (!serverSettings || !guild) return null
  return <Window key={guild.id} guild={guild} section={serverSection} />
}
