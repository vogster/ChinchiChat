import { ApiError } from '@chinchi/sdk'
import { BACKUP_ENTRIES_PER_UPLOAD, BACKUP_PAGE_MAX } from '@chinchi/shared'

import {
  deriveRecoveryKeys,
  formatRecoveryKey,
  generateRecoveryKey,
  openEntry,
  openUserKey,
  parseRecoveryKey,
  sealEntry,
  sealUserKey,
} from './recovery'

import type { E2eeApi } from './client'
import type { EncryptedPayload } from './codec'
import type { CrossSigning, StoredUserKey } from './cross-signing'
import type { RecoveryKeys } from './recovery'
import type { E2eeStore } from './store'
import type { DeviceKeys } from '@chinchi/e2ee'

/** The recovery key as a device that holds it keeps it (to show it again). */
interface StoredRecovery {
  readonly key: string
  readonly version: string
  /** The user said they saved it (no more reminders). */
  readonly saved: boolean
}

const RECOVERY = 'recovery'

export type UseKeyResult = 'ok' | 'invalid' | 'wrong'

export interface HistoryBackupDeps {
  readonly api: E2eeApi
  readonly store: E2eeStore
  readonly crossSigning: CrossSigning
}

/**
 * The history backup: every message this device reads or sends goes up encrypted with a key
 * derived from the recovery key, so a device that was not there can read it later.
 */
export const createHistoryBackup = ({ api, store, crossSigning }: HistoryBackupDeps) => {
  let derived: { key: string; keys: Promise<RecoveryKeys> } | null = null
  const pending = new Map<string, EncryptedPayload>()
  /** Sealed entries fetched per conversation, and the last message id seen there. */
  const fetched = new Map<string, { entries: Map<string, string>; after?: string }>()

  const current = async () => {
    const recovery = await store.get<StoredRecovery>(RECOVERY)
    if (!recovery) return null
    if (derived?.key !== recovery.key) {
      const raw = parseRecoveryKey(recovery.key) as Uint8Array
      derived = { key: recovery.key, keys: deriveRecoveryKeys(raw) }
    }
    return { version: recovery.version, keys: await derived.keys }
  }

  /** Fetches the conversation's entries newer than the last look. */
  const fetchMore = async (channelId: string) => {
    const known = fetched.get(channelId) ?? { entries: new Map<string, string>() }
    for (;;) {
      const { entries } = await api.e2ee.backupEntries({
        channelId,
        ...(known.after ? { after: known.after } : {}),
      })
      for (const entry of entries) known.entries.set(entry.messageId, entry.payload)
      const last = entries.at(-1)
      if (last) known.after = last.messageId
      if (entries.length < BACKUP_PAGE_MAX) break
    }
    fetched.set(channelId, known)
    return known.entries
  }

  return {
    /** A device holding the user key starts the backup if nobody has. */
    ensure: async (): Promise<void> => {
      if (await store.get<StoredRecovery>(RECOVERY)) return
      const userKey = await crossSigning.held()
      if (!userKey) return
      if ((await api.e2ee.backup()).backup) return
      const raw = generateRecoveryKey()
      const keys = await deriveRecoveryKeys(raw)
      try {
        const { backup } = await api.e2ee.createBackup({
          userKey: await sealUserKey(keys, userKey),
        })
        await store.set(RECOVERY, {
          key: formatRecoveryKey(raw),
          version: backup.version,
          saved: false,
        } satisfies StoredRecovery)
      } catch (error) {
        if (!(error instanceof ApiError && error.code === 'BACKUP_EXISTS')) throw error
      }
    },

    /** Starts over with a new recovery key (after a reset of the user key). */
    reset: async (userKey: StoredUserKey): Promise<void> => {
      const raw = generateRecoveryKey()
      const keys = await deriveRecoveryKeys(raw)
      const { backup } = await api.e2ee.createBackup({
        userKey: await sealUserKey(keys, userKey),
        replace: true,
      })
      fetched.clear()
      await store.set(RECOVERY, {
        key: formatRecoveryKey(raw),
        version: backup.version,
        saved: false,
      } satisfies StoredRecovery)
    },

    /** Remembers a message to back up; `flush` sends what piled up. */
    add: (messageId: string, payload: EncryptedPayload) => {
      pending.set(messageId, payload)
    },

    flush: async (): Promise<void> => {
      if (pending.size === 0) return
      const backup = await current()
      if (!backup) {
        pending.clear()
        return
      }
      const batch = [...pending].slice(0, BACKUP_ENTRIES_PER_UPLOAD)
      for (const [messageId] of batch) pending.delete(messageId)
      const entries = await Promise.all(
        batch.map(async ([messageId, payload]) => ({
          messageId,
          payload: await sealEntry(backup.keys, messageId, payload),
        })),
      )
      try {
        await api.e2ee.putBackupEntries({ version: backup.version, entries })
      } catch (error) {
        // A replaced backup or a message gone: nothing to retry. Anything else: next time.
        if (!(error instanceof ApiError && [404, 409].includes(error.status))) {
          for (const [messageId, payload] of batch) pending.set(messageId, payload)
        }
      }
    },

    /** A message this device can't decrypt, from the backup; null if it isn't there. */
    restore: async (channelId: string, messageId: string): Promise<EncryptedPayload | null> => {
      const backup = await current()
      if (!backup) return null
      let sealed = fetched.get(channelId)?.entries.get(messageId)
      if (!sealed) sealed = (await fetchMore(channelId)).get(messageId)
      return sealed ? openEntry(backup.keys, messageId, sealed) : null
    },

    /** The user typed their recovery key on this device: take back the user key and history. */
    useKey: async (text: string, device: DeviceKeys): Promise<UseKeyResult> => {
      const raw = parseRecoveryKey(text)
      if (!raw) return 'invalid'
      const keys = await deriveRecoveryKeys(raw)
      const [{ backup }, { userKey: current }] = await Promise.all([
        api.e2ee.backup(),
        api.e2ee.userKey('@me'),
      ])
      const userKey = backup ? await openUserKey(keys, backup.userKey) : null
      if (!backup || !userKey || userKey.publicKey !== current?.publicKey) return 'wrong'
      // Kept first: adopting announces the device as approved, and other tabs of this browser
      // look for the key as soon as they hear it.
      await store.set(RECOVERY, {
        key: formatRecoveryKey(raw),
        version: backup.version,
        saved: true,
      } satisfies StoredRecovery)
      try {
        await crossSigning.adopt(userKey, device)
      } catch (error) {
        await store.delete(RECOVERY)
        throw error
      }
      return 'ok'
    },

    key: async () => (await store.get<StoredRecovery>(RECOVERY))?.key ?? null,
    saved: async () => (await store.get<StoredRecovery>(RECOVERY))?.saved ?? false,
    markSaved: async () => {
      const recovery = await store.get<StoredRecovery>(RECOVERY)
      if (recovery) await store.set(RECOVERY, { ...recovery, saved: true })
    },
  }
}

export type HistoryBackup = ReturnType<typeof createHistoryBackup>
