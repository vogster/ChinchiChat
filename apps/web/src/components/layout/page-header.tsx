import { Menu } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useShell } from './shell-context'

import type { ReactNode } from 'react'

/** Top bar of the main area; on narrow screens it also opens the navigation drawer. */
export const PageHeader = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation()
  const { openMenu } = useShell()

  return (
    <header className="relative flex h-12 shrink-0 items-center gap-2 border-b border-border px-2 font-semibold shadow-sm md:px-4">
      <button
        type="button"
        aria-label={t('nav.openMenu')}
        onClick={openMenu}
        className="rounded p-1.5 text-muted hover:bg-hover hover:text-text md:hidden"
      >
        <Menu aria-hidden className="size-5" />
      </button>
      {children}
    </header>
  )
}
