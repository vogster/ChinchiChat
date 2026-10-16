import type { E2eeStore } from './store'

/** One decrypted message as the search index keeps it (only on this device). */
export interface IndexedMessage {
  readonly id: string
  readonly authorId: string | null
  readonly text: string
}

/** Results one search returns at most. */
const RESULTS_MAX = 50

const indexKey = (channelId: string) => `index:${channelId}`

const byNewest = (a: IndexedMessage, b: IndexedMessage) =>
  BigInt(b.id) > BigInt(a.id) ? 1 : BigInt(b.id) < BigInt(a.id) ? -1 : 0

/**
 * Search in encrypted conversations: the server can't, so each device keeps an index of what it
 * decrypted, per conversation, in its own storage, and searches that.
 */
export const createLocalSearch = (store: E2eeStore) => ({
  /** Adds a message (or its new text after an edit). */
  record: async (channelId: string, entry: IndexedMessage): Promise<void> => {
    const index = (await store.get<IndexedMessage[]>(indexKey(channelId))) ?? []
    const known = index.find((item) => item.id === entry.id)
    if (known?.text === entry.text) return
    await store.set(indexKey(channelId), [
      ...index.filter((item) => item.id !== entry.id),
      { ...entry, authorId: entry.authorId ?? known?.authorId ?? null },
    ])
  },

  /** Messages containing the text (any case), newest first. */
  search: async (channelId: string, query: string): Promise<IndexedMessage[]> => {
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return []
    const index = (await store.get<IndexedMessage[]>(indexKey(channelId))) ?? []
    return index
      .filter((item) => item.text.toLocaleLowerCase().includes(needle))
      .sort(byNewest)
      .slice(0, RESULTS_MAX)
  },
})
