import { createContext, useContext } from 'react'

import type { Shell } from './shell'
import type { ReactNode } from 'react'

export type { Shell, ShellPreferences } from './shell'

const ShellContext = createContext<Shell | null>(null)

export const ShellProvider = ({
  shell,
  children,
}: {
  shell: Shell | null
  children: ReactNode
}) => <ShellContext.Provider value={shell}>{children}</ShellContext.Provider>

/** The desktop shell, or null in a browser. */
// eslint-disable-next-line react-refresh/only-export-components -- hook belongs with its provider
export const useShell = (): Shell | null => useContext(ShellContext)
