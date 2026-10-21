import { THREAD_PREVIEW_LENGTH } from '@chinchi/shared'
import { and, count, desc, eq, inArray } from 'drizzle-orm'

import { attachments, channels, guildMembers, messages, users } from '../../db/schema'
import { toPublicUser } from '../users/user.mapper'

import type { DbExecutor } from '../../db/client'
import type { UserRow } from '../users/user.repository'
import type { Snowflake, ThreadPreview } from '@chinchi/shared'

/** One line of text: whitespace collapsed, cut at the preview length with an ellipsis. */
const shorten = (content: string) => {
  const line = content.replace(/\s+/g, ' ').trim()
  return line.length <= THREAD_PREVIEW_LENGTH
    ? line
    : `${line.slice(0, THREAD_PREVIEW_LENGTH - 1).trimEnd()}…`
}

/** The newest message of each thread in a channel (threads nobody wrote in are left out). */
export const loadThreadPreviews = async (
  db: DbExecutor,
  parent: { readonly id: Snowflake; readonly guildId: Snowflake },
): Promise<ThreadPreview[]> => {
  const rows = await db
    .selectDistinctOn([messages.channelId], {
      threadId: messages.channelId,
      messageId: messages.id,
      content: messages.content,
      webhookName: messages.webhookName,
      author: users,
      nickname: guildMembers.nickname,
    })
    .from(messages)
    .innerJoin(channels, eq(channels.id, messages.channelId))
    .leftJoin(users, eq(users.id, messages.authorId))
    .leftJoin(
      guildMembers,
      and(eq(guildMembers.guildId, parent.guildId), eq(guildMembers.userId, messages.authorId)),
    )
    .where(and(eq(channels.parentId, parent.id), eq(channels.type, 'thread')))
    .orderBy(messages.channelId, desc(messages.id))
  if (rows.length === 0) return []

  const files = await db
    .select({ messageId: attachments.messageId, n: count() })
    .from(attachments)
    .where(
      inArray(
        attachments.messageId,
        rows.map((row) => row.messageId),
      ),
    )
    .groupBy(attachments.messageId)

  return rows.map((row) => {
    const author = row.author ? toPublicUser(row.author as UserRow) : null
    return {
      threadId: row.threadId,
      messageId: row.messageId,
      author,
      authorName:
        row.nickname ?? author?.displayName ?? author?.username ?? row.webhookName ?? null,
      content: shorten(row.content),
      attachmentCount: files.find((file) => file.messageId === row.messageId)?.n ?? 0,
    }
  })
}
