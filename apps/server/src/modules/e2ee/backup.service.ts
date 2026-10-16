import { conflict, HttpError } from '../../http/http-error'

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
export const createBackupService = ({ backups, nextId }: BackupServiceDeps) => ({
  async get(userId: Snowflake): Promise<KeyBackup | null> {
    const row = await backups.find(userId)
    return row ? toBackup(row) : null
  },

  async create(
    userId: Snowflake,
    { userKey, replace = false }: CreateKeyBackupRequest,
  ): Promise<KeyBackup> {
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
