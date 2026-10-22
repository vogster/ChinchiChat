import type { E2eeStore } from './store'

const key = (channelId: string) => `encrypted:${channelId}`

/**
 * Which conversations this device has seen encrypted. The server says whether a conversation
 * is encrypted; one that suddenly says "not anymore" about a conversation remembered here would
 * have this device send in plaintext, so the app stops sending instead (see DowngradeNotice).
 * A device that never saw the conversation encrypted has nothing to compare with.
 */
export const createEncryptedMemory = (store: E2eeStore) => ({
  remember: (channelId: string): Promise<void> => store.set(key(channelId), true),
  wasEncrypted: async (channelId: string): Promise<boolean> =>
    (await store.get<boolean>(key(channelId))) === true,
})

export type EncryptedMemory = ReturnType<typeof createEncryptedMemory>
