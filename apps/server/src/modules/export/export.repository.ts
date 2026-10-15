import { and, asc, eq, gt } from 'drizzle-orm'

import { channels, guildMembers, guilds, messages } from '../../db/schema'

import type { DbExecutor } from '../../db/client'
import type { Snowflake } from '@chinchi/shared'

export interface ExportedMessageRow {
  readonly id: Snowflake
  readonly channelId: Snowflake
  readonly channelName: string | null
  readonly channelType: string
  readonly guildId: Snowflake | null
  readonly guildName: string | null
  readonly content: string
  readonly editedAt: Date | null
}

/** What a data export reads: a user's own messages (page by page) and memberships. */
export const createExportRepository = (db: DbExecutor) => ({
  async messagesBy(
    authorId: Snowflake,
    afterId: Snowflake | null,
    limit: number,
  ): Promise<ExportedMessageRow[]> {
    return db
      .select({
        id: messages.id,
        channelId: messages.channelId,
        channelName: channels.name,
        channelType: channels.type,
        guildId: channels.guildId,
        guildName: guilds.name,
        content: messages.content,
        editedAt: messages.editedAt,
      })
      .from(messages)
      .innerJoin(channels, eq(channels.id, messages.channelId))
      .leftJoin(guilds, eq(guilds.id, channels.guildId))
      .where(and(eq(messages.authorId, authorId), afterId ? gt(messages.id, afterId) : undefined))
      .orderBy(asc(messages.id))
      .limit(limit)
  },

  async memberships(userId: Snowflake) {
    return db
      .select({
        id: guilds.id,
        name: guilds.name,
        nickname: guildMembers.nickname,
        joinedAt: guildMembers.joinedAt,
      })
      .from(guildMembers)
      .innerJoin(guilds, eq(guilds.id, guildMembers.guildId))
      .where(eq(guildMembers.userId, userId))
      .orderBy(asc(guildMembers.joinedAt))
  },
})

export type ExportRepository = ReturnType<typeof createExportRepository>
