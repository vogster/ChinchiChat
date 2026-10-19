import { ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'

import type { ReactNode } from 'react'

/**
 * A settings row that opens in place: its title and a short state ("On") on one line, the form
 * underneath once opened. Rows in one `SettingsCard` are split by a line.
 */
export const SettingsRow = ({
  title,
  value,
  children,
}: {
  title: string
  /** What the row stands at now, shown at its end. */
  value?: ReactNode
  children: ReactNode
}) => {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  return (
    <div className="border-line not-first:border-t not-first:pt-3 not-last:pb-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((was) => !was)}
        className="flex min-h-10 w-full items-center gap-3 rounded-field px-1.5 text-left font-medium hover:text-text"
      >
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {value ? <span className="shrink-0 text-sm font-normal">{value}</span> : null}
        <ChevronDown
          aria-hidden
          className={`size-4 shrink-0 text-faint transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open ? (
        <div id={panelId} className="px-1.5 pt-3">
          {children}
        </div>
      ) : null}
    </div>
  )
}
