import * as RadixDialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'

import type { ReactNode } from 'react'

/**
 * A settings window over the chat (full screen on a phone): the menu on the left, the open
 * section on the right. The user's and a server's settings both open in it.
 */
export const SettingsWindow = ({
  title,
  navLabel,
  closeLabel,
  onClose,
  nav,
  wide = false,
  children,
}: {
  /** The window's accessible name. */
  title: string
  /** The menu's accessible name. */
  navLabel: string
  closeLabel: string
  onClose: () => void
  nav: ReactNode
  /** Roomier, for sections with tables (server settings). */
  wide?: boolean
  children: ReactNode
}) => {
  const { t } = useTranslation()
  return (
    <RadixDialog.Root open onOpenChange={(open) => (open ? undefined : onClose())}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-[rgb(8_8_16/0.5)] backdrop-blur-[3px]" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className={`fixed inset-0 z-40 flex flex-col overflow-hidden bg-main text-text shadow-modal focus:outline-none md:inset-auto md:top-1/2 md:left-1/2 md:h-[min(660px,calc(100%-48px))] md:-translate-x-1/2 md:-translate-y-1/2 md:flex-row md:rounded-[32px] ${wide ? 'md:h-[min(760px,calc(100%-48px))] md:w-[min(1080px,calc(100%-48px))]' : 'md:w-[min(920px,calc(100%-48px))]'}`}
        >
          <RadixDialog.Title className="sr-only">{title}</RadixDialog.Title>
          <aside className="shrink-0 bg-side pr-14 md:flex md:w-60 md:flex-col md:overflow-y-auto md:p-3 md:pt-5">
            <nav aria-label={navLabel} className="flex flex-1 flex-col">
              <div className="flex flex-1 gap-1 overflow-x-auto p-2 [scrollbar-width:none] md:flex-col md:gap-0 md:overflow-visible md:p-0">
                {nav}
              </div>
            </nav>
          </aside>

          {/* The bottom padding sits inside, so sticky bars (a role's "save") reach the edge. */}
          <div className="relative min-h-0 flex-1 overflow-y-auto px-4 pt-6 md:px-8 md:pt-7">
            <div className="mx-auto max-w-3xl pr-12 pb-6 md:mx-0 md:pb-7">
              <Suspense fallback={<p className="text-muted">{t('common.loading')}</p>}>
                {children}
              </Suspense>
            </div>
          </div>

          <RadixDialog.Close
            aria-label={closeLabel}
            title={closeLabel}
            className="absolute top-2.5 right-3 grid size-[34px] place-items-center rounded-full text-muted hover:bg-field hover:text-text md:top-5 md:right-5"
          >
            <X aria-hidden className="size-5" />
          </RadixDialog.Close>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
