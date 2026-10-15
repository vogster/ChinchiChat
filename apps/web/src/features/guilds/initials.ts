// Any more and they no longer fit the round icon, even in a small font.
const MAX_INITIALS = 3

/** Server icon placeholder: first character of each word, e.g. "Клуб любителей котиков" → "Клк". */
export const guildInitials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_INITIALS)
    .map((word) => Array.from(word)[0] ?? '')
    .join('')
