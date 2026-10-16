import type { E2eeApi, EncryptedChannel } from './client'
import type { EncryptedPayload } from './codec'
import type { E2eeStore } from './store'
import type { Conversation, DeviceKeys } from '@chinchi/e2ee'
import type { EncryptedReaction } from '@chinchi/shared'

export interface EncryptedReactionsDeps {
  readonly api: E2eeApi
  readonly store: E2eeStore
  readonly userId: string
  readonly serial: <T>(channelId: string, task: () => Promise<T>) => Promise<T>
  readonly ready: () => Promise<DeviceKeys>
  /** The conversation, in step with its members (as for sending). */
  readonly inStep: (channel: EncryptedChannel, keys: DeviceKeys) => Promise<Conversation>
  readonly encrypt: (
    channelId: string,
    conversation: Conversation,
    payload: EncryptedPayload,
  ) => Promise<string>
  /** Decrypts an MLS message of the conversation (not one this device sent). */
  readonly decrypt: (channelId: string, ciphertext: string) => Promise<EncryptedPayload | null>
  /** Puts a set into its message's history backup. */
  readonly keepReaction: (
    messageId: string,
    set: { userId: string; version: string; emojis: readonly string[] },
  ) => Promise<void>
  /** A set from the history backup, for a device that joined after it was sent. */
  readonly restoreReaction: (
    channelId: string,
    messageId: string,
    reaction: { userId: string; version: string },
  ) => Promise<readonly string[] | null>
}

const ownKey = (messageId: string) => `react:own:${messageId}`
const versionKey = (version: string) => `react:${version}`

/**
 * Reactions in encrypted conversations: each person's whole set for a message is one MLS
 * message, replaced on every change, so the server sees that they reacted, not with what.
 */
export const createEncryptedReactions = ({
  api,
  store,
  userId,
  serial,
  ready,
  inStep,
  encrypt,
  decrypt,
  keepReaction,
  restoreReaction,
}: EncryptedReactionsDeps) => ({
  /** Sets my reactions to a message (an empty set takes them back). */
  react: (channel: EncryptedChannel, messageId: string, emojis: readonly string[]) =>
    serial(channel.id, async () => {
      // This device can't decrypt what it sent: it keeps its own set.
      await store.set(ownKey(messageId), [...emojis])
      if (emojis.length === 0) {
        await api.reactions.setEncrypted(channel.id, messageId, null)
        return
      }
      const conversation = await inStep(channel, await ready())
      const ciphertext = await encrypt(channel.id, conversation, {
        v: 1,
        text: '',
        react: [...emojis],
      })
      await api.reactions.setEncrypted(channel.id, messageId, ciphertext)
    }),

  /** Someone's set of reactions to a message, decrypted once and then remembered. */
  readReaction: (
    channel: EncryptedChannel,
    messageId: string,
    reaction: EncryptedReaction,
  ): Promise<readonly string[]> =>
    serial(channel.id, async () => {
      const known = await store.get<string[]>(versionKey(reaction.version))
      if (known) return known
      const payload = await decrypt(channel.id, reaction.ciphertext).catch(() => null)
      const set =
        payload?.react ??
        (reaction.userId === userId ? await store.get<string[]>(ownKey(messageId)) : undefined) ??
        (await restoreReaction(channel.id, messageId, reaction))
      if (!set) return []
      await store.set(versionKey(reaction.version), [...set])
      await keepReaction(messageId, {
        userId: reaction.userId,
        version: reaction.version,
        emojis: set,
      })
      return set
    }),
})
