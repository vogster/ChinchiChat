import { z } from 'zod'

/** Sections of the user settings, in the order the menu lists them (`app`: desktop only). */
export const SETTINGS_SECTIONS = [
  'account',
  'profile',
  'privacy',
  'notifications',
  'voice',
  'sessions',
  'bots',
  'appearance',
  'language',
  'app',
] as const

export type SettingsSectionKey = (typeof SETTINGS_SECTIONS)[number]

export const isSettingsSection = (value: string): value is SettingsSectionKey =>
  (SETTINGS_SECTIONS as readonly string[]).includes(value)

/**
 * The settings open over whatever page is behind them (`?settings=profile`), so the chat, its
 * gateway connection and a voice call stay as they were. An unknown section is dropped.
 */
export const settingsSearchSchema = z.object({
  settings: z.enum(SETTINGS_SECTIONS).optional().catch(undefined),
})

export type SettingsSearch = z.infer<typeof settingsSearchSchema>

/**
 * Search params that open (or switch, or with undefined close) the settings over the current
 * page, keeping its other params. For `<Link to="." search={...}>` and `navigate`.
 */
export const withSettings =
  (settings: SettingsSectionKey | undefined) =>
  (prev: Record<string, unknown>): never => {
    const { settings: _, ...rest } = prev
    return (settings ? { ...rest, settings } : rest) as never
  }

/** Where the settings open at a given section, over the home screen (for links from outside). */
export const settingsHref = (section: SettingsSectionKey) => `/?settings=${section}`
