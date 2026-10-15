import { queryOptions } from '@tanstack/react-query'

export interface EmojiEntry {
  readonly emoji: string
  readonly label: string
  /** Words people search with ("ржака", "lol"). */
  readonly tags: readonly string[]
  readonly group: number
}

/** Emojibase groups shown as tabs (2 holds skin tone components, not emoji to pick). */
export const EMOJI_GROUPS = [
  { id: 0, key: 'smileys', icon: '😀' },
  { id: 1, key: 'people', icon: '👋' },
  { id: 3, key: 'nature', icon: '🐻' },
  { id: 4, key: 'food', icon: '🍕' },
  { id: 5, key: 'travel', icon: '🚗' },
  { id: 6, key: 'activities', icon: '⚽' },
  { id: 7, key: 'objects', icon: '💡' },
  { id: 8, key: 'symbols', icon: '❤️' },
  { id: 9, key: 'flags', icon: '🏳️' },
] as const

interface CompactEmoji {
  readonly unicode: string
  readonly label: string
  readonly tags?: readonly string[]
  readonly group?: number
  readonly order?: number
}

/** The dataset is large (~100 KB gzipped): it loads, per language, when a picker first opens. */
const load = async (language: string): Promise<EmojiEntry[]> => {
  const module = language.startsWith('ru')
    ? await import('emojibase-data/ru/compact.json')
    : await import('emojibase-data/en/compact.json')
  const shown = new Set<number>(EMOJI_GROUPS.map((group) => group.id))
  return (module.default as readonly CompactEmoji[])
    .filter((entry) => entry.group !== undefined && shown.has(entry.group))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((entry) => ({
      emoji: entry.unicode,
      label: entry.label,
      tags: entry.tags ?? [],
      group: entry.group as number,
    }))
}

export const emojiQueryOptions = (language: string) =>
  queryOptions({
    queryKey: ['emoji', language.startsWith('ru') ? 'ru' : 'en'],
    queryFn: () => load(language),
    staleTime: Infinity,
    gcTime: Infinity,
  })

/** Emoji whose name or tags contain every word of the query. */
export const searchEmoji = (entries: readonly EmojiEntry[], query: string): EmojiEntry[] => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return entries.filter((entry) => {
    const haystack = `${entry.label} ${entry.tags.join(' ')}`.toLowerCase()
    return words.every((word) => haystack.includes(word))
  })
}
