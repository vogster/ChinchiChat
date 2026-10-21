import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { Shell } from '../features/shell/shell'
import type { ReactNode } from 'react'

/** The region Tauri turns into a title bar: dragging moves the window, a double-click maximizes. */
const DRAG = { 'data-tauri-drag-region': true } as const

const glyph = (path: ReactNode) => (
  <svg aria-hidden="true" viewBox="0 0 10 10" className="size-2.5 fill-none stroke-current">
    {path}
  </svg>
)
const MINIMIZE = glyph(<path d="M0 5h10" />)
const MAXIMIZE = glyph(<rect x="0.5" y="0.5" width="9" height="9" />)
const RESTORE = glyph(
  <>
    <rect x="0.5" y="2.5" width="7" height="7" />
    <path d="M2.5 2.5v-2h7v7h-2" />
  </>,
)
const CLOSE = glyph(<path d="M0 0l10 10M10 0L0 10" />)

const WindowButton = ({
  label,
  onClick,
  danger = false,
  children,
}: {
  label: string
  onClick: () => void
  danger?: boolean
  children: ReactNode
}) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    className={`flex h-full w-11.5 items-center justify-center text-muted transition-colors hover:text-text ${
      danger ? 'hover:bg-danger hover:text-danger-contrast' : 'hover:bg-field'
    }`}
  >
    {children}
  </button>
)

const NavButton = ({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    className="flex size-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-field hover:text-text"
  >
    {children}
  </button>
)

/** The page title as the window shows it, kept current. */
const useDocumentTitle = () => {
  const [title, setTitle] = useState(() => document.title)
  useEffect(() => {
    const element = document.querySelector('title')
    if (!element) return undefined
    const observer = new MutationObserver(() => setTitle(document.title))
    observer.observe(element, { childList: true, characterData: true, subtree: true })
    return () => observer.disconnect()
  }, [])
  return title
}

const useMaximized = (shell: Shell) => {
  const [maximized, setMaximized] = useState(false)
  useEffect(() => {
    let unsubscribe: (() => void) | null = null
    let cancelled = false
    void shell.window.isMaximized().then((value) => {
      if (!cancelled) setMaximized(value)
    })
    void shell.window.onMaximizedChange(setMaximized).then((off) => {
      if (cancelled) off()
      else unsubscribe = off
    })
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [shell])
  return maximized
}

/**
 * The app's own title bar in the frameless desktop window: history arrows, the window title and,
 * where the OS does not draw them, the window buttons. On macOS the traffic lights stay native and
 * overlay the left edge, so the bar only keeps clear of them.
 */
export const TitleBar = ({ shell }: { shell: Shell }) => {
  const { t } = useTranslation()
  const title = useDocumentTitle()
  const maximized = useMaximized(shell)
  const macos = shell.platform === 'macos'

  return (
    <header
      {...DRAG}
      className={`relative flex h-8 shrink-0 items-center bg-rail select-none ${macos ? 'pl-20' : 'pl-2'}`}
    >
      <nav className="flex items-center gap-0.5">
        <NavButton label={t('desktop.window.back')} onClick={() => window.history.back()}>
          <ChevronLeft className="size-4" />
        </NavButton>
        <NavButton label={t('desktop.window.forward')} onClick={() => window.history.forward()}>
          <ChevronRight className="size-4" />
        </NavButton>
      </nav>
      <span
        {...DRAG}
        className="pointer-events-none absolute inset-x-0 text-center text-xs font-medium text-muted"
      >
        {title}
      </span>
      {macos ? null : (
        <div className="ml-auto flex h-full">
          <WindowButton
            label={t('desktop.window.minimize')}
            onClick={() => void shell.window.minimize()}
          >
            {MINIMIZE}
          </WindowButton>
          <WindowButton
            label={t(maximized ? 'desktop.window.restore' : 'desktop.window.maximize')}
            onClick={() => void shell.window.toggleMaximize()}
          >
            {maximized ? RESTORE : MAXIMIZE}
          </WindowButton>
          <WindowButton
            label={t('desktop.window.close')}
            onClick={() => void shell.window.close()}
            danger
          >
            {CLOSE}
          </WindowButton>
        </div>
      )}
    </header>
  )
}
