import { ChevronLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useShell } from './shell-context'

import type { ReactNode } from 'react'

/** A round icon button of the header (38px); pressed ones keep the hover look. */
export const headerButtonClass =
  'relative grid size-[38px] shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-field hover:text-text aria-pressed:bg-field aria-pressed:text-text'

/** Top bar of the main card; on narrow screens it also opens the navigation drawer. */
export const PageHeader = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation()
  const { openMenu } = useShell()

  return (
    <header className="relative flex h-[68px] shrink-0 items-center gap-2 pr-3 pl-3 md:gap-3 md:pr-4 md:pl-[18px]">
      <button
        type="button"
        aria-label={t('nav.openMenu')}
        onClick={openMenu}
        // Phones: back to the list of servers, channels and chats.
        className="grid size-11 shrink-0 place-items-center rounded-tile bg-field text-text md:hidden"
      >
        <ChevronLeft aria-hidden className="size-5" />
      </button>
      {children}
    </header>
  )
}

/**
 * The header's title block: a 40px tile with the place's glyph, the name (the page's h1) and,
 * under it, a topic or chips. `minWidth` keeps the title readable as the search field shrinks.
 */
export const PageTitle = ({
  glyph,
  tone = 'accent',
  title,
  subtitle,
  badge,
}: {
  glyph: ReactNode
  /** `secure` for end-to-end encrypted conversations. */
  tone?: 'accent' | 'secure'
  title: string
  subtitle?: ReactNode
  /** Beside the title, e.g. the NSFW label. */
  badge?: ReactNode
}) => (
  <>
    <span
      aria-hidden
      className={`grid size-10 shrink-0 place-items-center rounded-field text-[17px] font-semibold max-md:hidden ${tone === 'secure' ? 'bg-secure-soft text-secure-text' : 'bg-accent-soft text-accent-text'}`}
    >
      {glyph}
    </span>
    <div className="min-w-[96px] flex-1 basis-0">
      <div className="flex min-w-0 items-center gap-2">
        <h1 className="min-w-0 truncate text-base font-semibold">{title}</h1>
        {badge}
      </div>
      {subtitle ? <div className="truncate text-[12.5px] text-faint">{subtitle}</div> : null}
    </div>
  </>
)
