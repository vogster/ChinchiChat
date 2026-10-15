import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  sql,
} from 'drizzle-orm'

import { attachments, channels, messages, users } from '../../db/schema'
import { badRequest } from '../../http/http-error'

import type { DbExecutor } from '../../db/client'
import type { UserRow } from '../users/user.repository'
import type { SearchHas, Snowflake } from '@chinchi/shared'
import type { SQL } from 'drizzle-orm'

export type MessageRow = typeof messages.$inferSelect

export interface MessageWithAuthor {
  readonly message: MessageRow
  readonly author: UserRow | null
}

export interface PageQuery {
  readonly before?: Snowflake | undefined
  readonly after?: Snowflake | undefined
  readonly limit: number
}

/** Totals beyond this are shown as "N+": exact counts of huge result sets are costly. */
export const SEARCH_TOTAL_CAP = 1000
const SEARCH_TIMEOUT_MS = 5000

/** What `has:` means for a message. */
const HAS: Readonly<Record<SearchHas, SQL>> = {
  link: sql`${messages.content} ~* 'https?://'`,
  embed: sql`jsonb_array_length(${messages.embeds}) > 0`,
  file: sql`exists (select 1 from attachments where attachments.message_id = ${messages.id})`,
  image: sql`exists (select 1 from attachments where attachments.message_id = ${messages.id} and attachments.content_type like 'image/%')`,
}

export const createMessageRepository = (db: DbExecutor) => ({
  /**
   * Inserts, claims the author's pending attachments and bumps the channel's last message id in
   * one transaction. Fails if any attachment was claimed in the meantime.
   */
  async insert(
    message: Pick<
      MessageRow,
      | 'id'
      | 'channelId'
      | 'authorId'
      | 'content'
      | 'replyToId'
      | 'replyMention'
      | 'mentionUserIds'
      | 'mentionRoleIds'
      | 'mentionEveryone'
      | 'mentionHere'
    > &
      Partial<
        Pick<
          MessageRow,
          | 'webhookId'
          | 'webhookName'
          | 'interactionName'
          | 'interactionUserId'
          | 'system'
          | 'ciphertext'
        >
      >,
    attachmentIds: readonly Snowflake[] = [],
  ): Promise<MessageRow> {
    return db.transaction(async (tx) => {
      const [row] = await tx.insert(messages).values(message).returning()
      if (attachmentIds.length > 0) {
        const claimed = await tx
          .update(attachments)
          .set({ messageId: message.id })
          .where(and(inArray(attachments.id, [...attachmentIds]), isNull(attachments.messageId)))
          .returning({ id: attachments.id })
        if (claimed.length !== attachmentIds.length) {
          throw badRequest('INVALID_ATTACHMENT', 'Attachment is missing, expired or invalid')
        }
      }
      await tx
        .update(channels)
        .set({ lastMessageId: message.id })
        .where(eq(channels.id, message.channelId))
      return row as MessageRow
    })
  },

  async findInChannel(channelId: Snowflake, id: Snowflake): Promise<MessageWithAuthor | null> {
    const [row] = await db
      .select({ message: messages, author: users })
      .from(messages)
      .leftJoin(users, eq(users.id, messages.authorId))
      .where(and(eq(messages.channelId, channelId), eq(messages.id, id)))
      .limit(1)
    return row ?? null
  },

  /** Several messages of a channel (e.g. the originals of replies), with their authors. */
  async findManyInChannel(
    channelId: Snowflake,
    ids: readonly Snowflake[],
  ): Promise<MessageWithAuthor[]> {
    if (ids.length === 0) return []
    return db
      .select({ message: messages, author: users })
      .from(messages)
      .leftJoin(users, eq(users.id, messages.authorId))
      .where(and(eq(messages.channelId, channelId), inArray(messages.id, [...ids])))
  },

  async setEmbeds(id: Snowflake, embeds: MessageRow['embeds']): Promise<MessageRow | null> {
    const [row] = await db.update(messages).set({ embeds }).where(eq(messages.id, id)).returning()
    return row ?? null
  },

  /** Pins or unpins; null when the message was already in that state. */
  async setPinned(id: Snowflake, pinnedAt: Date | null): Promise<MessageRow | null> {
    const [row] = await db
      .update(messages)
      .set({ pinnedAt })
      .where(
        and(
          eq(messages.id, id),
          pinnedAt ? isNull(messages.pinnedAt) : isNotNull(messages.pinnedAt),
        ),
      )
      .returning()
    return row ?? null
  },

  /**
   * Pins under the channel's row lock, so concurrent pins never pass `max`. 'unchanged' when
   * the message was already pinned (or is gone).
   */
  async pinChecked(
    channelId: Snowflake,
    id: Snowflake,
    pinnedAt: Date,
    max: number,
  ): Promise<MessageRow | 'unchanged' | 'full'> {
    return db.transaction(async (tx) => {
      await tx
        .select({ id: channels.id })
        .from(channels)
        .where(eq(channels.id, channelId))
        .for('update')
      const [target] = await tx
        .select({ pinnedAt: messages.pinnedAt })
        .from(messages)
        .where(eq(messages.id, id))
      if (!target || target.pinnedAt) return 'unchanged'
      const [pinned] = await tx
        .select({ value: count() })
        .from(messages)
        .where(and(eq(messages.channelId, channelId), isNotNull(messages.pinnedAt)))
      if ((pinned?.value ?? 0) >= max) return 'full'
      const [row] = await tx
        .update(messages)
        .set({ pinnedAt })
        .where(eq(messages.id, id))
        .returning()
      return row ?? 'unchanged'
    })
  },

  /** Pinned messages, most recently pinned first. */
  async listPinned(channelId: Snowflake): Promise<MessageWithAuthor[]> {
    return db
      .select({ message: messages, author: users })
      .from(messages)
      .leftJoin(users, eq(users.id, messages.authorId))
      .where(and(eq(messages.channelId, channelId), isNotNull(messages.pinnedAt)))
      .orderBy(desc(messages.pinnedAt))
  },

  /** One page, returned oldest → newest whichever direction it was fetched in. */
  async page(
    channelId: Snowflake,
    { before, after, limit }: PageQuery,
  ): Promise<MessageWithAuthor[]> {
    const forward = after !== undefined
    const rows = await db
      .select({ message: messages, author: users })
      .from(messages)
      .leftJoin(users, eq(users.id, messages.authorId))
      .where(
        and(
          eq(messages.channelId, channelId),
          before !== undefined ? lt(messages.id, before) : undefined,
          after !== undefined ? gt(messages.id, after) : undefined,
        ),
      )
      .orderBy(forward ? asc(messages.id) : desc(messages.id))
      .limit(limit)
    return forward ? rows : rows.reverse()
  },

  async updateContent(
    id: Snowflake,
    content: string,
    editedAt: Date,
    mentions: Pick<
      MessageRow,
      'mentionUserIds' | 'mentionRoleIds' | 'mentionEveryone' | 'mentionHere'
    >,
  ): Promise<MessageRow> {
    const [row] = await db
      .update(messages)
      .set({ content, editedAt, ...mentions })
      .where(eq(messages.id, id))
      .returning()
    return row as MessageRow
  },

  /** Encrypted conversations: a new MLS message replaces the old one. */
  async updateCiphertext(id: Snowflake, ciphertext: string, editedAt: Date): Promise<MessageRow> {
    const [row] = await db
      .update(messages)
      .set({ ciphertext, editedAt })
      .where(eq(messages.id, id))
      .returning()
    return row as MessageRow
  },

  /** True when the message was there to delete (two deletes at once: only one is). */
  async delete(id: Snowflake): Promise<boolean> {
    const removed = await db
      .delete(messages)
      .where(eq(messages.id, id))
      .returning({ id: messages.id })
    return removed.length > 0
  },

  /** The ids actually deleted. */
  async deleteMany(ids: readonly Snowflake[]): Promise<Snowflake[]> {
    if (ids.length === 0) return []
    const removed = await db
      .delete(messages)
      .where(inArray(messages.id, [...ids]))
      .returning({ id: messages.id })
    return removed.map((row) => row.id)
  },

  /** Whether anyone but this user wrote in the channel. */
  async hasOthersMessages(channelId: Snowflake, userId: Snowflake): Promise<boolean> {
    const [row] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.channelId, channelId),
          or(isNull(messages.authorId), ne(messages.authorId, userId)),
        ),
      )
      .limit(1)
    return row !== undefined
  },

  /**
   * Full-text search over the given channels, newest first. `total` counts matches up to
   * `SEARCH_TOTAL_CAP` and only on the first page (null after); a statement timeout keeps
   * an overly broad search from tying up the database.
   */
  async search({
    channelIds,
    q,
    authorId,
    has,
    before,
    limit,
  }: {
    channelIds: readonly Snowflake[]
    q?: string | undefined
    authorId?: Snowflake | undefined
    has?: SearchHas | undefined
    before?: Snowflake | undefined
    limit: number
  }): Promise<{ rows: MessageWithAuthor[]; total: number | null }> {
    if (channelIds.length === 0) return { rows: [], total: before ? null : 0 }
    const matching = and(
      inArray(messages.channelId, [...channelIds]),
      q ? sql`"messages"."search_vector" @@ websearch_to_tsquery('russian', ${q})` : undefined,
      authorId ? eq(messages.authorId, authorId) : undefined,
      has ? HAS[has] : undefined,
    )
    return db.transaction(async (tx) => {
      // SET takes no bind parameters; the value is a constant.
      await tx.execute(sql.raw(`SET LOCAL statement_timeout = ${SEARCH_TIMEOUT_MS}`))
      try {
        const rows = await tx
          .select({ message: messages, author: users })
          .from(messages)
          .leftJoin(users, eq(users.id, messages.authorId))
          .where(and(matching, before ? lt(messages.id, before) : undefined))
          .orderBy(desc(messages.id))
          .limit(limit)
        if (before) return { rows, total: null }
        const capped = tx
          .select({ id: messages.id })
          .from(messages)
          .where(matching)
          .limit(SEARCH_TOTAL_CAP)
          .as('capped')
        const [counted] = await tx.select({ total: count() }).from(capped)
        return { rows, total: Number(counted?.total ?? 0) }
      } catch (error) {
        if ((error as { code?: string }).code === '57014') {
          throw badRequest('SEARCH_TOO_BROAD', 'The search is too broad: add words or filters')
        }
        throw error
      }
    })
  },

  /** An author's messages on a server newer than `afterId` (ids grow with time). */
  async listRecentByAuthorInGuild(
    guildId: Snowflake,
    authorId: Snowflake,
    afterId: Snowflake,
  ): Promise<{ id: Snowflake; channelId: Snowflake }[]> {
    return db
      .select({ id: messages.id, channelId: messages.channelId })
      .from(messages)
      .innerJoin(channels, eq(channels.id, messages.channelId))
      .where(
        and(
          eq(channels.guildId, guildId),
          eq(messages.authorId, authorId),
          gt(messages.id, afterId),
        ),
      )
  },
})

export type MessageRepository = ReturnType<typeof createMessageRepository>
