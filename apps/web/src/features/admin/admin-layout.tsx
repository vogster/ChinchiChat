import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { settingsNavItemClass, SettingsShell } from '../../components/layout/settings-shell'
import { useCurrentUser } from '../auth/use-auth-actions'

import type { ReactNode } from 'react'

const NAV = [
  { to: '/admin/users', key: 'users' },
  { to: '/admin/guilds', key: 'guilds' },
  { to: '/admin/reports', key: 'reports' },
  { to: '/admin/instance', key: 'instance' },
] as const

/** Full-screen frame of the instance admin panel; only admins see what is inside. */
export const AdminLayout = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation()
  const me = useCurrentUser()

  return (
    <SettingsShell
      title={t('admin.title')}
      closeLabel={t('admin.back')}
      closeTo="/settings/account"
      closeKind="back"
      nav={
        me?.isAdmin
          ? NAV.map((item) => (
              <Link key={item.to} to={item.to} className={settingsNavItemClass}>
                {t(`admin.nav.${item.key}`)}
              </Link>
            ))
          : null
      }
    >
      {me?.isAdmin ? children : <p className="text-muted">{t('admin.noAccess')}</p>}
    </SettingsShell>
  )
}
