import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { settingsNavItemClass } from '../../components/layout/settings-shell'
import { SettingsWindow } from '../../components/layout/settings-window'
import { useCurrentUser } from '../auth/use-auth-actions'
import { withSettings } from '../settings/settings-search'
import { AdminReportsSection } from './admin-reports'
import { ADMIN_SECTIONS, withAdmin } from './admin-search'
import { AdminGuildsSection } from './guilds-section'
import { AdminInstanceSection } from './instance-section'
import { AdminUsersSection } from './users-section'

import type { AdminSearch, AdminSection } from './admin-search'
import type { ComponentType } from 'react'

const PAGES: Readonly<Record<AdminSection, ComponentType>> = {
  users: AdminUsersSection,
  guilds: AdminGuildsSection,
  reports: AdminReportsSection,
  instance: AdminInstanceSection,
}

/**
 * The instance administration as a window over the page (full screen on a phone), opened from
 * the user settings; only admins see what is inside (the server checks it too).
 */
export const AdminDialog = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const me = useCurrentUser()
  const { admin } = useSearch({ strict: false }) as AdminSearch
  if (!admin) return null
  const Page = PAGES[admin]

  return (
    <SettingsWindow
      title={t('admin.title')}
      navLabel={t('admin.title')}
      closeLabel={t('admin.close')}
      onClose={() => void navigate({ to: '.', search: withAdmin(undefined) })}
      nav={
        <>
          <Link
            to="."
            search={(prev) => withSettings('account')(withAdmin(undefined)(prev))}
            className={`${settingsNavItemClass} gap-2 md:mb-2`}
          >
            <ArrowLeft aria-hidden className="size-4 shrink-0" />
            {t('admin.back')}
          </Link>
          {me?.isAdmin ? (
            // The same 2px between items as in the user settings, so hover and active don't touch.
            <div className="flex gap-1 md:flex-col md:gap-0.5">
              {ADMIN_SECTIONS.map((key) => (
                <Link
                  key={key}
                  to="."
                  search={withAdmin(key)}
                  aria-current={key === admin ? 'page' : undefined}
                  data-status={key === admin ? 'active' : undefined}
                  className={settingsNavItemClass}
                >
                  {t(`admin.nav.${key}`)}
                </Link>
              ))}
            </div>
          ) : null}
        </>
      }
    >
      {me?.isAdmin ? <Page /> : <p className="text-muted">{t('admin.noAccess')}</p>}
    </SettingsWindow>
  )
}
