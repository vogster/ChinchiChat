import { createContext, useContext } from 'react'

export interface ShellState {
  readonly menuOpen: boolean
  readonly openMenu: () => void
  readonly closeMenu: () => void
}

export const ShellContext = createContext<ShellState>({
  menuOpen: false,
  openMenu: () => undefined,
  closeMenu: () => undefined,
})

export const useShell = () => useContext(ShellContext)
