/**
 * Appearance choices, stored per browser and applied as `data-*` attributes on <html>,
 * which `styles.css` turns into tokens. The first value of each list is the default:
 * it is not stored and leaves the attribute off.
 */
export const THEMES = ['system', 'dark', 'light'] as const
export const PALETTES = ['chinchilla', 'neon', 'plum'] as const
export const DENSITIES = ['cozy', 'compact'] as const

/** `system` follows the OS; the others pin the theme. */
export type ThemeChoice = (typeof THEMES)[number]
export type PaletteChoice = (typeof PALETTES)[number]
export type DensityChoice = (typeof DENSITIES)[number]

interface Setting<T extends string> {
  readonly storageKey: string
  readonly attribute: 'theme' | 'palette' | 'density'
  readonly choices: readonly T[]
}

const THEME: Setting<ThemeChoice> = {
  storageKey: 'chinchi.theme',
  attribute: 'theme',
  choices: THEMES,
}
const PALETTE: Setting<PaletteChoice> = {
  storageKey: 'chinchi.palette',
  attribute: 'palette',
  choices: PALETTES,
}
const DENSITY: Setting<DensityChoice> = {
  storageKey: 'chinchi.density',
  attribute: 'density',
  choices: DENSITIES,
}

const read = <T extends string>({ storageKey, choices }: Setting<T>): T => {
  const [fallback] = choices as readonly [T]
  try {
    const stored = localStorage.getItem(storageKey)
    return choices.find((choice) => choice === stored) ?? fallback
  } catch {
    return fallback
  }
}

const apply = <T extends string>({ attribute, choices }: Setting<T>, choice: T) => {
  const root = document.documentElement
  if (choice === choices[0]) root.removeAttribute(`data-${attribute}`)
  else root.setAttribute(`data-${attribute}`, choice)
}

const store = <T extends string>(setting: Setting<T>, choice: T) => {
  try {
    if (choice === setting.choices[0]) localStorage.removeItem(setting.storageKey)
    else localStorage.setItem(setting.storageKey, choice)
  } catch {
    // Private mode: the choice lasts for this page only.
  }
  apply(setting, choice)
}

export const readTheme = () => read(THEME)
export const readPalette = () => read(PALETTE)
export const readDensity = () => read(DENSITY)

export const setTheme = (choice: ThemeChoice) => store(THEME, choice)
export const setPalette = (choice: PaletteChoice) => store(PALETTE, choice)
export const setDensity = (choice: DensityChoice) => store(DENSITY, choice)

/** Called before the first render, so a stored choice never flashes the default one. */
export const applyStoredTheme = () => {
  apply(THEME, readTheme())
  apply(PALETTE, readPalette())
  apply(DENSITY, readDensity())
}
