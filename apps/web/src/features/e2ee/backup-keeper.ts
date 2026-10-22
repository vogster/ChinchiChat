import type { EncryptedPayload } from './codec'
import type { HistoryBackup } from './history-backup'
import type { E2eeStore } from './store'

/**
 * What this device reads or sends goes into the history backup, reactions riding along with
 * their message, so the user's next device gets it back with the recovery key.
 */
export const createBackupKeeper = ({
  store,
  backup,
}: {
  store: E2eeStore
  backup: HistoryBackup
}) => {
  /** What this device last backed up of a message (reactions ride along with it). */
  const backedUp = (messageId: string) => store.get<EncryptedPayload>(`backup:${messageId}`)

  /** Backs a message up, sending soon (several messages read together go in one upload). */
  const send = async (messageId: string, entry: EncryptedPayload) => {
    await store.set(`backup:${messageId}`, entry)
    backup.add(messageId, entry)
    queueMicrotask(() => void backup.flush().catch(() => undefined))
  }

  return {
    /** A message read or sent here (the reactions already backed up with it stay). */
    keep: async (messageId: string, payload: EncryptedPayload) => {
      const before = await backedUp(messageId)
      await send(
        messageId,
        before?.reactionSets ? { ...payload, reactionSets: before.reactionSets } : payload,
      )
    },

    /** Someone's set of reactions, added to its message's backup (if the message is known here). */
    keepReaction: async (
      messageId: string,
      set: { userId: string; version: string; emojis: readonly string[] },
    ) => {
      const before = await backedUp(messageId)
      if (!before) return
      const others = (before.reactionSets ?? []).filter((s) => s.userId !== set.userId)
      await send(messageId, {
        ...before,
        reactionSets: [...others, { ...set, emojis: [...set.emojis] }],
      })
    },

    /** A set of reactions this device can't decrypt (it joined later), from the backup. */
    restoreReaction: async (
      channelId: string,
      messageId: string,
      reaction: { userId: string; version: string },
    ) => {
      const entry = await backup.restore(channelId, messageId).catch(() => null)
      return (
        entry?.reactionSets?.find(
          (s) => s.userId === reaction.userId && s.version === reaction.version,
        )?.emojis ?? null
      )
    },
  }
}

export type BackupKeeper = ReturnType<typeof createBackupKeeper>
