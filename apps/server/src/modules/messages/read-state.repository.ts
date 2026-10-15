import { eq, sql } from 'drizzle-orm'

import { readStates } from '../../db/schema'

import type { DbExecutor } from '../../db/client'
import { CHINCHI_EPOCH } from '@chinchi/shared'

import type { MentionCounts, ReadState, Snowflake } from '@chinchi/shared'

const bigintArray = (ids: readonly Snowflake[]) => sql`${`{${ids.join(',')}}`}::bigint[]`

export const createReadStateRepository = (db: DbExecutor) => ({
  /** Moves the marker forward only: acking an older message never "unreads" newer ones. */
  async advance(userId: Snowflake, channelId: Snowflake, messageId: Snowflake): Promise<Snowflake> {
    const [row] = await db
      .insert(readStates)
      .values({ userId, channelId, lastReadMessageId: messageId })
      .onConflictDoUpdate({
        target: [readStates.userId, readStates.channelId],
        set: {
          lastReadMessageId: sql`greatest(${readStates.lastReadMessageId}, excluded.last_read_message_id)`,
          updatedAt: sql`now()`,
        },
      })
      .returning({ lastReadMessageId: readStates.lastReadMessageId })
    return row?.lastReadMessageId ?? messageId
  },

  /**
   * Unread messages mentioning the user, their roles, @everyone or @here, per channel. Computed
   * on demand from the messages (via a partial index), so @everyone writes nothing per member.
   * Messages from before the user joined the server never count: the lower bound is the later
   * of the read marker and the snowflake of the join time.
   */
  async mentionCounts(
    userId: Snowflake,
    channelIds: readonly Snowflake[],
    roleIds: readonly Snowflake[],
  ): Promise<MentionCounts> {
    if (channelIds.length === 0) return {}
    const rows = await db.execute<{ channel_id: string; count: number }>(sql`
      select m.channel_id::text as channel_id, count(*)::int as count
      from messages m
      join channels c on c.id = m.channel_id
      join guild_members gm on gm.guild_id = c.guild_id and gm.user_id = ${userId}
      left join read_states rs on rs.channel_id = m.channel_id and rs.user_id = ${userId}
      where m.channel_id = any(${bigintArray(channelIds)})
        and m.id > greatest(
          coalesce(rs.last_read_message_id, 0),
          ((extract(epoch from gm.joined_at) * 1000)::bigint - ${CHINCHI_EPOCH}::bigint) << 22
        )
        and m.author_id is distinct from ${userId}
        and (
          m.mention_everyone
          or m.mention_here
          or ${userId}::bigint = any(m.mention_user_ids)
          or m.mention_role_ids && ${bigintArray(roleIds)}
        )
      group by m.channel_id
    `)
    return Object.fromEntries([...rows].map((row) => [row.channel_id, row.count]))
  },

  /** Unread messages from others per channel (DMs), counting at most 100 per channel. */
  async unreadCounts(userId: Snowflake, channelIds: readonly Snowflake[]): Promise<MentionCounts> {
    if (channelIds.length === 0) return {}
    const rows = await db.execute<{ channel_id: string; count: number }>(sql`
      select c.id::text as channel_id, (
        select count(*)::int from (
          select 1 from messages m
          where m.channel_id = c.id
            and m.id > coalesce(rs.last_read_message_id, 0)
            and m.author_id is distinct from ${userId}
          limit 100
        ) unread
      ) as count
      from channels c
      left join read_states rs on rs.channel_id = c.id and rs.user_id = ${userId}
      where c.id = any(${bigintArray(channelIds)})
    `)
    return Object.fromEntries(
      [...rows].filter((row) => row.count > 0).map((row) => [row.channel_id, row.count]),
    )
  },

  async listForUser(userId: Snowflake): Promise<ReadState[]> {
    return db
      .select({ channelId: readStates.channelId, lastReadMessageId: readStates.lastReadMessageId })
      .from(readStates)
      .where(eq(readStates.userId, userId))
  },
})

export type ReadStateRepository = ReturnType<typeof createReadStateRepository>
