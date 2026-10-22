import { conflict, forbidden, HttpError } from '../../http/http-error'

import type { BackupEntryRow, BackupRepository, KeyBackupRow } from './backup.repository'
import type {
  BackupEntry,
  CreateKeyBackupRequest,
  KeyBackup,
  Snowflake,
  UploadBackupEntriesRequest,
} from '@chinchi/shared'

export interface BackupServiceDeps {
  readonly backups: BackupRepository
  /** When the user's current key was set: a backup is replaced only along with it. */
  readonly userKeySetAt: (userId: Snowflake) => Promise<Date | null>
  readonly nextId: () => Snowflake
}

const toBackup = (row: KeyBackupRow): KeyBackup => ({
  version: row.version,
  userKey: row.userKey,
  createdAt: row.createdAt.toISOString(),
})

const toEntry = (row: BackupEntryRow): BackupEntry => ({
  messageId: row.messageId,
  channelId: row.channelId,
  payload: row.payload,
})

/**
 * History backups of encrypted conversations. Everything here is encrypted by the user's
 * devices with keys the server never sees; it only keeps it, per user and per message.
 */
export const createBackupService = ({ backups, userKeySetAt, nextId }: BackupServiceDeps) => ({
  async get(userId: Snowflake): Promise<KeyBackup | null> {
    const row = await backups.find(userId)
    return row ? toBackup(row) : null
  },

  /**
   * Replacing wipes the history kept so far, so it comes only after a new user key, which takes
   * the password: a stolen session alone cannot throw the history away.
   */
  async create(
    userId: Snowflake,
    { userKey, replace = false }: CreateKeyBackupRequest,
  ): Promise<KeyBackup> {
    if (replace) {
      const [current, keySetAt] = await Promise.all([backups.find(userId), userKeySetAt(userId)])
      if (current && !(keySetAt && keySetAt > current.createdAt)) {
        throw forbidden('BACKUP_KEY_UNCHANGED', 'Reset the encryption key before the backup')
      }
    }
    const row = replace
      ? await backups.replace(userId, nextId(), userKey)
      : await backups.insert(userId, nextId(), userKey)
    if (!row) throw conflict('BACKUP_EXISTS', 'This user already has a backup')
    return toBackup(row)
  },

  /** Only messages of the user's own encrypted conversations, into the current backup. */
  async putEntries(
    userId: Snowflake,
    { version, entries }: UploadBackupEntriesRequest,
  ): Promise<void> {
    const channelOf = await backups.ownMessageChannels(
      userId,
      entries.map((entry) => entry.messageId),
    )
    if (entries.some((entry) => !channelOf.has(entry.messageId))) {
      throw new HttpError(404, 'UNKNOWN_MESSAGE', 'Unknown message')
    }
    const stored = await backups.putEntries(
      userId,
      version,
      entries.map((entry) => ({
        messageId: entry.messageId,
        channelId: channelOf.get(entry.messageId) as Snowflake,
        payload: entry.payload,
      })),
    )
    if (!stored) throw conflict('STALE_BACKUP', 'The backup was replaced')
  },

  async listEntries(
    userId: Snowflake,
    channelId: Snowflake,
    after: Snowflake | undefined,
    limit: number,
  ): Promise<BackupEntry[]> {
    return (await backups.listEntries(userId, channelId, after, limit)).map(toEntry)
  },
})

export type BackupService = ReturnType<typeof createBackupService>
