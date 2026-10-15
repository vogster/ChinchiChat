import * as RadixDialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { ReactNode } from 'react'

export interface DialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly title: string
  readonly description?: string | undefined
  readonly children: ReactNode
  /** `lg` for dialogs with dense content such as permission tables. */
  readonly size?: 'md' | 'lg'
}

const SIZES = { md: 'max-w-md', lg: 'max-w-2xl' } as const

/** Accessible modal (focus trap, Escape, aria wiring) on top of Radix Dialog. */
export const Dialog = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  size = 'md',
}: DialogProps) => {
  const { t } = useTranslation()

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
        <RadixDialog.Content
          className={`fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] ${SIZES[size]} -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-main p-5 text-text shadow-2xl focus:outline-none`}
          {...(description ? {} : { 'aria-describedby': undefined })}
          // A dialog with a form starts in its first field, ready to type (Radix would pick the
          // first focusable element, which is the close button in the header).
          onOpenAutoFocus={(event) => {
            const field = (event.currentTarget as HTMLElement).querySelector<HTMLElement>(
              'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])',
            )
            if (!field) return
            event.preventDefault()
            field.focus()
          }}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <RadixDialog.Title className="text-xl font-semibold">{title}</RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="mt-1 text-sm text-muted">
                  {description}
                </RadixDialog.Description>
              ) : null}
            </div>
            <RadixDialog.Close
              aria-label={t('common.close')}
              className="rounded p-1 text-muted hover:bg-hover hover:text-text"
            >
              <X aria-hidden className="size-5" />
            </RadixDialog.Close>
          </div>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
