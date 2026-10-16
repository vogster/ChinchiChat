import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm'

import {
  channelRecipients,
  channels,
  e2eeBackupEntries,
  e2eeKeyBackups,
  messages,
} from '../../db/schema'

import type { DbExecutor } from '../../db/client'
import type { Snowflake } from '@chinchi/shared'

export type KeyBackupRow = typeof e2eeKeyBackups.$inferSelect
export type BackupEntryRow = typeof e2eeBackupEntries.$inferSelect

export const createBackupRepository = (db: DbExecutor) => ({
  async find(userId: Snowflake): Promise<KeyBackupRow | null> {
    const [row] = await db.select().from(e2eeKeyBackups).where(eq(e2eeKeyBackups.userId, userId))
    return row ?? null
  },

  /** Null when the user already has a backup. */
  async insert(
    userId: Snowflake,
    version: Snowflake,
    userKey: string,
  ): Promise<KeyBackupRow | null> {
    const [row] = await db
      .insert(e2eeKeyBackups)
      .values({ userId, version, userKey })
      .onConflictDoNothing({ target: e2eeKeyBackups.userId })
      .returning()
    return row ?? null
  },

  /** A new backup: the old entries were encrypted for a recovery key that is gone. */
  async replace(userId: Snowflake, version: Snowflake, userKey: string): Promise<KeyBackupRow> {
    return db.transaction(async (tx) => {
      await tx.delete(e2eeBackupEntries).where(eq(e2eeBackupEntries.userId, userId))
      const [row] = await tx
        .insert(e2eeKeyBackups)
        .values({ userId, version, userKey })
        .onConflictDoUpdate({
          target: e2eeKeyBackups.userId,
          set: { version, userKey, createdAt: new Date() },
        })
        .returning()
      return row as KeyBackupRow
    })
  },

  /** The channel of each message the user may back up: in an encrypted conversation of theirs. */
  async ownMessageChannels(
    userId: Snowflake,
    messageIds: readonly Snowflake[],
  ): Promise<Map<Snowflake, Snowflake>> {
    const rows = await db
      .select({ id: messages.id, channelId: messages.channelId })
      .from(messages)
      .innerJoin(channels, and(eq(channels.id, messages.channelId), eq(channels.encrypted, true)))
      .innerJoin(
        channelRecipients,
        and(
          eq(channelRecipients.channelId, messages.channelId),
          eq(channelRecipients.userId, userId),
        ),
      )
      .where(inArray(messages.id, [...messageIds]))
    return new Map(rows.map((row) => [row.id, row.channelId]))
  },

  /** Stores entries if the backup is still at `version`; false when it moved on. */
  async putEntries(
    userId: Snowflake,
    version: Snowflake,
    entries: readonly Omit<BackupEntryRow, 'userId'>[],
  ): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [backup] = await tx
        .select({ version: e2eeKeyBackups.version })
        .from(e2eeKeyBackups)
        .where(eq(e2eeKeyBackups.userId, userId))
        .for('update')
      if (backup?.version !== version) return false
      await tx
        .insert(e2eeBackupEntries)
        .values(entries.map((entry) => ({ ...entry, userId })))
        .onConflictDoUpdate({
          target: [e2eeBackupEntries.userId, e2eeBackupEntries.messageId],
          set: { payload: sql`excluded.payload` },
        })
      return true
    })
  },

  listEntries: (
    userId: Snowflake,
    channelId: Snowflake,
    after: Snowflake | undefined,
    limit: number,
  ): Promise<BackupEntryRow[]> =>
    db
      .select()
      .from(e2eeBackupEntries)
      .where(
        and(
          eq(e2eeBackupEntries.userId, userId),
          eq(e2eeBackupEntries.channelId, channelId),
          ...(after ? [gt(e2eeBackupEntries.messageId, after)] : []),
        ),
      )
      .orderBy(asc(e2eeBackupEntries.messageId))
      .limit(limit),
})

export type BackupRepository = ReturnType<typeof createBackupRepository>
