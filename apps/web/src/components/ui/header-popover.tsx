import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import type { ReactNode } from 'react'

/**
 * A card that drops from the chat header (threads, pins), over the messages rather than beside
 * them. Escape or a click outside closes it, and focus goes back where it was.
 */
export const HeaderPopover = ({
  label,
  title = label,
  icon,
  subtitle,
  onClose,
  children,
}: {
  /** The accessible name; `title` is what shows, when shorter. */
  label: string
  title?: string
  icon: ReactNode
  subtitle?: string
  onClose: () => void
  children: ReactNode
}) => {
  const { t } = useTranslation()
  const card = useRef<HTMLDivElement>(null)
  // The latest onClose, so a new function from the parent does not restart the effect below.
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  }, [onClose])

  useEffect(() => {
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const node = card.current
    node?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      // Unless focus already moved on purpose (a jump to a message), give it back.
      if (node?.contains(document.activeElement) || document.activeElement === document.body) {
        returnTo?.focus()
      }
    }
  }, [])

  return (
    <>
      {/* Transparent: the chat stays visible, a click anywhere outside just closes. */}
      <div aria-hidden className="absolute inset-0 z-20" onClick={onClose} />
      <div
        ref={card}
        role="dialog"
        aria-label={label}
        tabIndex={-1}
        className="absolute top-16 right-3 z-30 flex max-h-[calc(100%-76px)] w-[min(400px,calc(100%-24px))] flex-col overflow-hidden rounded-panel bg-side shadow-popover outline-none"
      >
        <header className="flex shrink-0 items-center gap-3 p-3 pb-2">
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text"
          >
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-semibold">{title}</h2>
            {subtitle ? <p className="truncate text-xs text-faint">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            aria-label={t('common.close')}
            onClick={onClose}
            className="grid size-[34px] shrink-0 place-items-center rounded-full text-muted hover:bg-field hover:text-text"
          >
            <X aria-hidden className="size-4" />
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto p-2 pt-1">{children}</div>
      </div>
    </>
  )
}
