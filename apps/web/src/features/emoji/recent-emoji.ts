/** Emoji picked lately, newest first; kept per browser. */
const STORAGE_KEY = 'chinchi.recentEmoji'
const MAX_RECENT = 16

export const readRecentEmoji = (): string[] => {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(stored)
      ? stored.filter((item): item is string => typeof item === 'string').slice(0, MAX_RECENT)
      : []
  } catch {
    return []
  }
}

export const rememberEmoji = (emoji: string) => {
  const next = [emoji, ...readRecentEmoji().filter((item) => item !== emoji)].slice(0, MAX_RECENT)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Private mode: nothing is remembered.
  }
}
