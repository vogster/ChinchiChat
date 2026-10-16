import { z } from 'zod'

import { snowflakeSchema } from '../snowflake/snowflake'
import { CIPHERTEXT_MAX_BASE64, base64Schema } from './e2ee.schemas'

/** Entries one upload may carry. */
export const BACKUP_ENTRIES_PER_UPLOAD = 100
/** Entries one page of a conversation's backup returns at most. */
export const BACKUP_PAGE_MAX = 200

/**
 * A user's history backup: the user's private key, encrypted with a key only the recovery key
 * derives. The server can't open it; a device with the recovery key can.
 */
export const keyBackupSchema = z.object({
  /** Entries belong to one version; a new backup (new recovery key) starts over. */
  version: snowflakeSchema,
  userKey: z.string(),
  createdAt: z.iso.datetime(),
})

export const createKeyBackupRequestSchema = z.strictObject({
  /** The encrypted user private key, base64. */
  userKey: base64Schema(512),
  /** Starts a new backup (new recovery key): every entry of the old one is dropped. */
  replace: z.boolean().optional(),
})

/** One message as the user read it, encrypted with the backup key. */
export const backupEntrySchema = z.object({
  messageId: snowflakeSchema,
  channelId: snowflakeSchema,
  payload: z.string(),
})

export const uploadBackupEntriesRequestSchema = z.strictObject({
  version: snowflakeSchema,
  entries: z
    .array(
      z.strictObject({
        messageId: snowflakeSchema,
        payload: base64Schema(CIPHERTEXT_MAX_BASE64),
      }),
    )
    .min(1)
    .max(BACKUP_ENTRIES_PER_UPLOAD),
})

export const listBackupEntriesQuerySchema = z.object({
  channelId: snowflakeSchema,
  /** Entries of messages after this one (oldest first). */
  after: snowflakeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(BACKUP_PAGE_MAX).default(BACKUP_PAGE_MAX),
})

export type KeyBackup = z.infer<typeof keyBackupSchema>
export type CreateKeyBackupRequest = z.infer<typeof createKeyBackupRequestSchema>
export type BackupEntry = z.infer<typeof backupEntrySchema>
export type UploadBackupEntriesRequest = z.infer<typeof uploadBackupEntriesRequestSchema>
export type ListBackupEntriesQuery = z.input<typeof listBackupEntriesQuerySchema>
