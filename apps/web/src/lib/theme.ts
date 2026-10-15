/** `system` follows the OS; the others pin the theme (stored per browser). */
export type ThemeChoice = 'system' | 'dark' | 'light'

const STORAGE_KEY = 'chinchi.theme'

export const readTheme = (): ThemeChoice => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'dark' || stored === 'light' ? stored : 'system'
  } catch {
    return 'system'
  }
}

const apply = (choice: ThemeChoice) => {
  const root = document.documentElement
  if (choice === 'system') delete root.dataset.theme
  else root.dataset.theme = choice
}

export const setTheme = (choice: ThemeChoice) => {
  try {
    if (choice === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, choice)
  } catch {
    // Private mode: the choice lasts for this page only.
  }
  apply(choice)
}

/** Called before the first render, so a pinned theme never flashes the other one. */
export const applyStoredTheme = () => apply(readTheme())
