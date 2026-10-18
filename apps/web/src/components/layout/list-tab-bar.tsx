import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate, useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { guildsQueryOptions } from '../../features/guilds/queries'
import { withSettings } from '../../features/settings/settings-search'
import { useApi } from '../../lib/api-context'
import { useShell } from './shell-context'

const tabClass =
  'rounded-[26px] text-[12.5px] font-medium text-muted transition-colors aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent-text'

/**
 * The phone's list screen ends in a floating tab bar: servers, chats, profile. Switching tabs
 * keeps the list open (unlike picking a channel, which shows the chat).
 */
export const ListTabBar = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const router = useRouter()
  const { openMenuAt } = useShell()
  const pathname = useLocation({ select: (location) => location.pathname })
  const { data: guilds = [] } = useQuery(guildsQueryOptions(useApi()))
  const inServer = pathname.startsWith('/channels/') && !pathname.startsWith('/channels/@me')
  const [first] = guilds

  // Stays open where the navigation ends, redirects included (a server opens its first channel).
  const go = async (to: () => Promise<void>) => {
    await to()
    openMenuAt(router.state.location.pathname)
  }

  return (
    <nav
      aria-label={t('nav.sections')}
      className="absolute inset-x-4 bottom-6 z-10 grid h-16 grid-cols-3 gap-1 rounded-[32px] bg-field p-1.5 shadow-[0_10px_30px_rgb(10_10_20/0.18)] md:hidden"
    >
      <button
        type="button"
        aria-current={inServer ? 'page' : undefined}
        disabled={!first && !inServer}
        onClick={() =>
          first && !inServer
            ? void go(() => navigate({ to: '/channels/$guildId', params: { guildId: first.id } }))
            : undefined
        }
        className={tabClass}
      >
        {t('nav.tabServers')}
      </button>
      <button
        type="button"
        aria-current={inServer ? undefined : 'page'}
        onClick={() => void go(() => navigate({ to: '/' }))}
        className={tabClass}
      >
        {t('nav.tabChats')}
      </button>
      <button
        type="button"
        onClick={() => void navigate({ to: '.', search: withSettings('account') })}
        className={tabClass}
      >
        {t('nav.tabProfile')}
      </button>
    </nav>
  )
}
