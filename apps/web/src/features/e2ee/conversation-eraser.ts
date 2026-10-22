import type { IndexedMessage } from './local-search'
import type { E2eeStore } from './store'

/**
 * Wipes an encrypted conversation from this device once it is deleted for everyone: its MLS
 * state, the plaintext of every message decrypted or sent here (each edit has its own key),
 * their backups and reactions, the search index and what the group membership kept. The
 * conversation stays known as once encrypted (see encrypted-memory.ts): a server must not be
 * able to bring the same id back as a plain one.
 */
export const createConversationEraser = (store: E2eeStore) => ({
  /**
   * `keepKeys`: only the text goes; the MLS state and what the group membership knows stay,
   * since this device is still in the group for the others (a conversation only hidden here).
   */
  async forget(channelId: string, { keepKeys = false }: { keepKeys?: boolean } = {}) {
    const indexed = (await store.get<IndexedMessage[]>(`index:${channelId}`)) ?? []
    for (const { id } of indexed) {
      await store.deletePrefix(`plain:${id}`)
      await store.delete(`backup:${id}`)
      await store.delete(`react:own:${id}`)
    }
    await store.delete(`index:${channelId}`)
    if (keepKeys) return
    for (const key of [
      `conv:${channelId}`,
      `group:known:${channelId}`,
      `group:invited:${channelId}`,
      `group:notices:${channelId}`,
    ]) {
      await store.delete(key)
    }
  },
})
