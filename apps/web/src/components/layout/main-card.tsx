import type { ReactNode } from 'react'

/**
 * The main column's card. The shell's <main> is only a row of cards, so a page puts its content
 * in this one and its side panels (members, search, a thread) in cards of their own beside it.
 */
export const MainCard = ({ children }: { children: ReactNode }) => (
  <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-main md:rounded-panel">
    {children}
  </div>
)
