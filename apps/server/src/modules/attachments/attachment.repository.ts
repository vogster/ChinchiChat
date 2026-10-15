import { and, asc, count, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm'

import { attachments } from '../../db/schema'

import type { DbExecutor } from '../../db/client'
import type { Snowflake } from '@chinchi/shared'

export type AttachmentRow = typeof attachments.$inferSelect

export interface PendingQuery {
  readonly ids: readonly Snowflake[]
  readonly uploaderId: Snowflake
  readonly channelId: Snowflake
  /** Uploads requested before this moment have expired. */
  readonly createdAfter: Date
}

const ownJob = (job: Pick<AttachmentRow, 'id' | 'previewAttempts'>) =>
  and(
    eq(attachments.id, job.id),
    eq(attachments.previewState, 'pending'),
    eq(attachments.previewAttempts, job.previewAttempts),
  )

export const createAttachmentRepository = (db: DbExecutor) => ({
  async insert(
    attachment: Pick<
      AttachmentRow,
      'id' | 'channelId' | 'uploaderId' | 'filename' | 'contentType' | 'size' | 'previewState'
    >,
  ): Promise<AttachmentRow> {
    const [row] = await db.insert(attachments).values(attachment).returning()
    return row as AttachmentRow
  },

  async setSize(id: Snowflake, size: number): Promise<void> {
    await db.update(attachments).set({ size }).where(eq(attachments.id, id))
  },

  async findById(id: Snowflake): Promise<AttachmentRow | null> {
    const [row] = await db.select().from(attachments).where(eq(attachments.id, id)).limit(1)
    return row ?? null
  },

  /** The uploader's unsent, unexpired uploads in a channel, among `ids`. */
  async findPending({
    ids,
    uploaderId,
    channelId,
    createdAfter,
  }: PendingQuery): Promise<AttachmentRow[]> {
    if (ids.length === 0) return []
    return db
      .select()
      .from(attachments)
      .where(
        and(
          inArray(attachments.id, [...ids]),
          eq(attachments.uploaderId, uploaderId),
          eq(attachments.channelId, channelId),
          isNull(attachments.messageId),
          gt(attachments.createdAt, createdAfter),
        ),
      )
  },

  /** How many unsent, unexpired uploads the user has. */
  async countPending(uploaderId: Snowflake, createdAfter: Date): Promise<number> {
    const [row] = await db
      .select({ value: count() })
      .from(attachments)
      .where(
        and(
          eq(attachments.uploaderId, uploaderId),
          isNull(attachments.messageId),
          gt(attachments.createdAt, createdAfter),
        ),
      )
    return row?.value ?? 0
  },

  /**
   * Leases up to `limit` sent images waiting for a preview. Rows leased by a live worker are
   * skipped; an expired lease (the worker died) makes a row claimable again.
   */
  async claimPreviewJobs({
    limit,
    leaseMs,
    maxAttempts,
  }: {
    limit: number
    leaseMs: number
    maxAttempts: number
  }): Promise<AttachmentRow[]> {
    // A worker that died on the last attempt leaves an expired lease: that image is done for.
    await db
      .update(attachments)
      .set({ previewState: 'failed', previewLockedUntil: null })
      .where(
        and(
          eq(attachments.previewState, 'pending'),
          sql`${attachments.previewAttempts} >= ${maxAttempts}`,
          lt(attachments.previewLockedUntil, sql`now()`),
        ),
      )
    const queue = db
      .select({ id: attachments.id })
      .from(attachments)
      .where(
        and(
          eq(attachments.previewState, 'pending'),
          isNotNull(attachments.messageId),
          lt(attachments.previewAttempts, maxAttempts),
          or(
            isNull(attachments.previewLockedUntil),
            lt(attachments.previewLockedUntil, sql`now()`),
          ),
        ),
      )
      .orderBy(asc(attachments.id))
      .limit(limit)
      .for('update', { skipLocked: true })
    return db
      .update(attachments)
      .set({
        previewAttempts: sql`${attachments.previewAttempts} + 1`,
        previewLockedUntil: sql`now() + ${`${leaseMs} milliseconds`}::interval`,
      })
      .where(inArray(attachments.id, queue))
      .returning()
  },

  /**
   * Stores the result of a claimed job. The attempt count fences it: false if another worker
   * has taken the job over since, or the attachment is gone.
   */
  async completePreview(
    job: Pick<AttachmentRow, 'id' | 'previewAttempts'>,
    size: { width: number; height: number },
  ): Promise<boolean> {
    const rows = await db
      .update(attachments)
      .set({ ...size, previewState: 'ready', previewLockedUntil: null })
      .where(ownJob(job))
      .returning({ id: attachments.id })
    return rows.length > 0
  },

  /** The last attempt failed for good (otherwise the lease delays the retry). Fenced the same way. */
  async failPreview(job: Pick<AttachmentRow, 'id' | 'previewAttempts'>): Promise<boolean> {
    const rows = await db
      .update(attachments)
      .set({ previewState: 'failed', previewLockedUntil: null })
      .where(ownJob(job))
      .returning({ id: attachments.id })
    return rows.length > 0
  },

  /** How many attachments each of the given messages has (messages without any are absent). */
  async countByMessages(messageIds: readonly Snowflake[]): Promise<Map<Snowflake, number>> {
    if (messageIds.length === 0) return new Map()
    const rows = await db
      .select({ messageId: attachments.messageId, value: count() })
      .from(attachments)
      .where(inArray(attachments.messageId, [...messageIds]))
      .groupBy(attachments.messageId)
    return new Map(rows.flatMap((row) => (row.messageId ? [[row.messageId, row.value]] : [])))
  },

  /** Attachments of the given messages, in upload order. */
  async listByMessages(messageIds: readonly Snowflake[]): Promise<AttachmentRow[]> {
    if (messageIds.length === 0) return []
    return db
      .select()
      .from(attachments)
      .where(inArray(attachments.messageId, [...messageIds]))
      .orderBy(asc(attachments.id))
  },
})

export type AttachmentRepository = ReturnType<typeof createAttachmentRepository>
