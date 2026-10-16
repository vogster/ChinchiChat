import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { settingsNavItemClass, SettingsShell } from '../../components/layout/settings-shell'
import { useCurrentUser, useLogout } from '../auth/use-auth-actions'
import { useShell } from '../shell/shell-context'

import type { ReactNode } from 'react'

const NAV = [
  { to: '/settings/account', key: 'account' },
  { to: '/settings/profile', key: 'profile' },
  { to: '/settings/privacy', key: 'privacy' },
  { to: '/settings/notifications', key: 'notifications' },
  { to: '/settings/voice', key: 'voice' },
  { to: '/settings/sessions', key: 'sessions' },
  { to: '/settings/bots', key: 'bots' },
  { to: '/settings/appearance', key: 'appearance' },
  { to: '/settings/language', key: 'language' },
] as const

export const SettingsLayout = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation()
  const logout = useLogout()
  const me = useCurrentUser()
  const shell = useShell()

  return (
    <SettingsShell
      title={t('settings.title')}
      closeLabel={t('settings.close')}
      closeTo="/"
      nav={
        <>
          {NAV.map((item) => (
            <Link key={item.to} to={item.to} className={settingsNavItemClass}>
              {t(`settings.nav.${item.key}`)}
            </Link>
          ))}
          {shell ? (
            <Link to="/settings/app" className={settingsNavItemClass}>
              {t('settings.nav.app')}
            </Link>
          ) : null}
          {me?.isAdmin ? (
            <>
              <hr className="mx-2 hidden border-border md:my-2 md:block" />
              <Link to="/admin/users" className={settingsNavItemClass}>
                {t('settings.nav.admin')}
              </Link>
            </>
          ) : null}
          <hr className="mx-2 hidden border-border md:my-2 md:block" />
          <button
            type="button"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className={`${settingsNavItemClass} text-left text-red-400 hover:text-red-300`}
          >
            {t('settings.logout')}
          </button>
        </>
      }
    >
      {children}
    </SettingsShell>
  )
}
