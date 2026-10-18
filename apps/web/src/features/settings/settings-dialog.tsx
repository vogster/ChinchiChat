import * as RadixDialog from '@radix-ui/react-dialog'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'

import { settingsNavItemClass } from '../../components/layout/settings-shell'
import { Avatar } from '../../components/ui/avatar'
import { useCurrentUser, useLogout } from '../auth/use-auth-actions'
import { useShell } from '../shell/shell-context'
import { SETTINGS_PAGES } from './settings-page-map'
import { withSettings } from './settings-search'

import type { SettingsSearch, SettingsSectionKey } from './settings-search'

/** The menu's groups, in order; a section not listed here is not shown. */
const GROUPS: readonly {
  key: 'account' | 'app' | 'developers'
  sections: readonly SettingsSectionKey[]
}[] = [
  { key: 'account', sections: ['account', 'profile', 'privacy', 'notifications', 'sessions'] },
  { key: 'app', sections: ['voice', 'appearance', 'language', 'app'] },
  { key: 'developers', sections: ['bots'] },
]

const MiniProfile = () => {
  const me = useCurrentUser()
  if (!me) return null
  const name = me.displayName ?? me.username
  return (
    <div className="flex items-center gap-2.5 px-2 pb-3 max-md:hidden">
      <Avatar
        name={name}
        src={me.avatarUrl}
        id={me.id}
        rounded="rounded-[14px]"
        className="size-10"
      />
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{name}</div>
        <div className="truncate text-xs text-faint">@{me.username}</div>
      </div>
    </div>
  )
}

const SettingsNav = ({ current }: { current: SettingsSectionKey }) => {
  const { t } = useTranslation()
  const logout = useLogout()
  const me = useCurrentUser()
  const shell = useShell()
  // The desktop app's own section is only there inside the app.
  const shown = (key: SettingsSectionKey) => key !== 'app' || shell !== null

  const item = (key: SettingsSectionKey) => (
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
  )

  return (
    <>
      <MiniProfile />
      {GROUPS.map((group) => (
        <div
          key={group.key}
          role="group"
          aria-labelledby={`settings-group-${group.key}`}
          className="flex gap-1 md:flex-col md:gap-0.5 md:pb-3"
        >
          <p
            id={`settings-group-${group.key}`}
            className="px-3 pb-1 text-[12px] font-medium text-faint max-md:sr-only"
          >
            {t(`settings.groups.${group.key}`)}
          </p>
          {group.sections.filter(shown).map(item)}
          {group.key === 'developers' && me?.isAdmin ? (
            <Link to="/admin/users" className={settingsNavItemClass}>
              {t('settings.nav.admin')}
            </Link>
          ) : null}
        </div>
      ))}
      <button
        type="button"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
        className="flex h-[38px] shrink-0 items-center rounded-field px-3 text-left text-[13.5px] font-medium text-danger transition-colors hover:bg-danger-soft md:mt-auto max-md:rounded-full max-md:bg-danger-soft"
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
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-[rgb(8_8_16/0.5)] backdrop-blur-[3px]" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-main text-text shadow-modal focus:outline-none md:inset-auto md:top-1/2 md:left-1/2 md:h-[min(660px,calc(100%-48px))] md:w-[min(920px,calc(100%-48px))] md:-translate-x-1/2 md:-translate-y-1/2 md:flex-row md:rounded-[32px]"
        >
          <aside className="shrink-0 bg-side pr-14 md:flex md:w-60 md:flex-col md:overflow-y-auto md:p-3 md:pt-5">
            <nav aria-label={t('settings.title')} className="flex flex-1 flex-col">
              <RadixDialog.Title className="sr-only">{t('settings.title')}</RadixDialog.Title>
              <div className="flex flex-1 gap-1 overflow-x-auto p-2 [scrollbar-width:none] md:flex-col md:gap-0 md:overflow-visible md:p-0">
                <SettingsNav current={settings} />
              </div>
            </nav>
          </aside>

          <main className="relative min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-7">
            <div className="mx-auto max-w-3xl pr-12 md:mx-0">
              <Suspense fallback={<p className="text-muted">{t('common.loading')}</p>}>
                <Page />
              </Suspense>
            </div>
          </main>

          <RadixDialog.Close
            aria-label={t('settings.close')}
            title={t('settings.close')}
            className="absolute top-2.5 right-3 grid size-[34px] place-items-center rounded-full text-muted hover:bg-field hover:text-text md:top-5 md:right-5"
          >
            <X aria-hidden className="size-5" />
          </RadixDialog.Close>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
