import * as RadixDialog from '@radix-ui/react-dialog'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'

import { settingsNavItemClass } from '../../components/layout/settings-shell'
import { useCurrentUser, useLogout } from '../auth/use-auth-actions'
import { useShell } from '../shell/shell-context'
import { SETTINGS_PAGES } from './settings-page-map'
import { SETTINGS_SECTIONS, withSettings } from './settings-search'

import type { SettingsSearch, SettingsSectionKey } from './settings-search'

const SettingsNav = ({ current }: { current: SettingsSectionKey }) => {
  const { t } = useTranslation()
  const logout = useLogout()
  const me = useCurrentUser()
  const shell = useShell()
  // The desktop app's own section is only there inside the app.
  const sections = SETTINGS_SECTIONS.filter((key) => key !== 'app' || shell)

  return (
    <>
      {sections.map((key) => (
        <Link
          key={key}
          to="."
          search={withSettings(key)}
          aria-current={key === current ? 'page' : undefined}
          data-status={key === current ? 'active' : undefined}
          className={settingsNavItemClass}
        >
          {t(`settings.nav.${key}`)}
        </Link>
      ))}
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
  )
}

/**
 * The user settings as a window over the chat (full screen on a phone). Which section is open
 * lives in the URL (`?settings=`), so the chat behind keeps its connection and voice call.
 */
export const SettingsDialog = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { settings } = useSearch({ strict: false }) as SettingsSearch
  if (!settings) return null
  const Page = SETTINGS_PAGES[settings]

  const close = () => void navigate({ to: '.', search: withSettings(undefined) })

  return (
    <RadixDialog.Root open onOpenChange={(open) => (open ? undefined : close())}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/70" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-main text-text shadow-2xl focus:outline-none md:inset-auto md:top-1/2 md:left-1/2 md:h-[min(85vh,56rem)] md:w-[min(72rem,calc(100%-4rem))] md:-translate-x-1/2 md:-translate-y-1/2 md:flex-row md:rounded-lg"
        >
          <aside className="shrink-0 bg-sidebar md:w-56 md:overflow-y-auto md:py-8 md:pl-4">
            <nav aria-label={t('settings.title')} className="flex flex-col">
              <RadixDialog.Title className="hidden truncate px-2.5 pb-1 text-xs font-bold tracking-wide text-muted uppercase md:block">
                {t('settings.title')}
              </RadixDialog.Title>
              <div className="flex gap-1 overflow-x-auto p-2 pr-14 md:flex-col md:overflow-visible md:p-0 md:pr-2">
                <SettingsNav current={settings} />
              </div>
            </nav>
          </aside>

          <main className="relative min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-10 md:py-8">
            <div className="mx-auto max-w-3xl pr-12 md:mx-0">
              <Suspense fallback={<p className="text-muted">{t('common.loading')}</p>}>
                <Page />
              </Suspense>
            </div>
          </main>

          <RadixDialog.Close
            aria-label={t('settings.close')}
            title={t('settings.close')}
            className="absolute top-2 right-3 flex size-9 items-center justify-center rounded-full border-2 border-muted text-muted hover:border-text hover:text-text md:top-8 md:right-8"
          >
            <X aria-hidden className="size-5" />
          </RadixDialog.Close>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
