import { createContext, useContext } from 'react'

export interface ShellState {
  readonly menuOpen: boolean
  readonly openMenu: () => void
  /** Keeps the menu open on another page (the phone's list switching tabs). */
  readonly openMenuAt: (pathname: string) => void
  readonly closeMenu: () => void
}

export const ShellContext = createContext<ShellState>({
  menuOpen: false,
  openMenu: () => undefined,
  openMenuAt: () => undefined,
  closeMenu: () => undefined,
})

export const useShell = () => useContext(ShellContext)
