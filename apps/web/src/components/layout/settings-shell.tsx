import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft, X } from 'lucide-react'
import { useEffect } from 'react'

import type { ReactNode } from 'react'

export const settingsNavItemClass =
  'shrink-0 rounded px-2.5 py-1.5 text-sm text-muted hover:bg-hover hover:text-text data-[status=active]:bg-hover data-[status=active]:text-text'

export interface SettingsShellProps {
  readonly title: string
  readonly closeLabel: string
  /** Where Escape and the close button lead. */
  readonly closeTo: string
  /** A section inside other settings goes back to them rather than closing everything. */
  readonly closeKind?: 'close' | 'back'
  readonly nav: ReactNode
  readonly children: ReactNode
}

/** Full-screen settings frame shared by user and server settings. */
export const SettingsShell = ({
  title,
  closeLabel,
  closeTo,
  closeKind = 'close',
  nav,
  children,
}: SettingsShellProps) => {
  const navigate = useNavigate()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Escape inside an open dialog closes the dialog, not the settings.
      if (event.key === 'Escape' && !document.querySelector('[role="dialog"]'))
        void navigate({ href: closeTo })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate, closeTo])

  return (
    <div className="flex h-full flex-col bg-main md:flex-row">
      <aside className="shrink-0 bg-sidebar md:flex md:w-64 md:justify-end md:py-14 md:pr-2">
        <nav aria-label={title} className="flex flex-col md:w-48">
          <p className="hidden truncate px-2.5 pb-1 text-xs font-bold tracking-wide text-muted uppercase md:block">
            {title}
          </p>
          <div className="flex gap-1 overflow-x-auto p-2 md:flex-col md:overflow-visible md:p-0">
            {nav}
          </div>
        </nav>
      </aside>

      <main className="relative min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-10 md:py-14">
        {/* Right padding keeps content clear of the close button. */}
        <div className="mx-auto max-w-3xl pr-12 md:mx-0 md:pr-14">{children}</div>
        <a
          href={closeTo}
          onClick={(event) => {
            event.preventDefault()
            void navigate({ href: closeTo })
          }}
          aria-label={closeLabel}
          title={closeLabel}
          className="absolute top-4 right-4 flex size-9 items-center justify-center rounded-full border-2 border-muted text-muted hover:border-text hover:text-text md:top-14 md:right-10"
        >
          {closeKind === 'back' ? (
            <ArrowLeft aria-hidden className="size-5" />
          ) : (
            <X aria-hidden className="size-5" />
          )}
        </a>
      </main>
    </div>
  )
}
