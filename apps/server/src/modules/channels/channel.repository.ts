import { and, asc, eq, inArray, isNull, max, sql } from 'drizzle-orm'

import { channels } from '../../db/schema'

import type { DbExecutor } from '../../db/client'
import type { ChannelType, Snowflake } from '@chinchi/shared'

/** Any channel row: a server channel or a DM (guildId null). */
export type AnyChannelRow = typeof channels.$inferSelect

/** A server channel: what all server code works with. */
export type ChannelRow = Omit<AnyChannelRow, 'guildId' | 'type'> & {
  readonly guildId: Snowflake
  readonly type: ChannelType
}

/** Channels that hold messages: server text channels and DMs. */
export const isMessageChannel = (type: AnyChannelRow['type']) =>
  type === 'text' || type === 'thread' || type === 'dm' || type === 'group_dm'

export const isGuildChannel = (channel: AnyChannelRow): channel is ChannelRow =>
  channel.guildId !== null && channel.type !== 'dm' && channel.type !== 'group_dm'
/** Locks a channel's row for the transaction (threads and permission syncs of a parent). */
export const lockChannel = async (tx: DbExecutor, id: Snowflake): Promise<ChannelRow | null> => {
  const [row] = await tx.select().from(channels).where(eq(channels.id, id)).for('update')
  return (row as ChannelRow | undefined) ?? null
}

export type NewChannel = Pick<
  typeof channels.$inferInsert,
  'id' | 'guildId' | 'type' | 'name' | 'parentId' | 'position' | 'topic'
> &
  Partial<
    Pick<typeof channels.$inferInsert, 'threadStarterId' | 'ownerId' | 'rateLimitPerUser' | 'nsfw'>
  >

export const createChannelRepository = (db: DbExecutor) => ({
  async insertMany(rows: readonly NewChannel[]): Promise<ChannelRow[]> {
    if (rows.length === 0) return []
    return (await db
      .insert(channels)
      .values([...rows])
      .returning()) as ChannelRow[]
  },

  /** A text channel's threads. */
  async listThreads(parentId: Snowflake): Promise<ChannelRow[]> {
    return (await db
      .select()
      .from(channels)
      .where(and(eq(channels.parentId, parentId), eq(channels.type, 'thread')))) as ChannelRow[]
  },

  /** Threads whose starter messages were deleted lose the link; returns those threads. */
  async clearThreadStarters(messageIds: readonly Snowflake[]): Promise<ChannelRow[]> {
    if (messageIds.length === 0) return []
    return (await db
      .update(channels)
      .set({ threadStarterId: null })
      .where(inArray(channels.threadStarterId, [...messageIds]))
      .returning()) as ChannelRow[]
  },

  /** A text channel's slowmode and age restriction, copied to its threads. */
  async setThreadPace(parentId: Snowflake, rateLimitPerUser: number, nsfw: boolean) {
    return (await db
      .update(channels)
      .set({ rateLimitPerUser, nsfw })
      .where(and(eq(channels.parentId, parentId), eq(channels.type, 'thread')))
      .returning()) as ChannelRow[]
  },

  /** Adds `delta` to a thread's message count (never below zero). */
  async bumpMessageCount(id: Snowflake, delta: number): Promise<ChannelRow | null> {
    const [row] = await db
      .update(channels)
      .set({ messageCount: sql`greatest(${channels.messageCount} + ${delta}, 0)` })
      .where(and(eq(channels.id, id), eq(channels.type, 'thread')))
      .returning()
    return (row as ChannelRow | undefined) ?? null
  },

  async listByGuild(guildId: Snowflake): Promise<ChannelRow[]> {
    return (await db
      .select()
      .from(channels)
      .where(eq(channels.guildId, guildId))
      .orderBy(asc(channels.position), asc(channels.id))) as ChannelRow[]
  },

  /** Any channel, a DM included: callers check which kind they got. */
  async findById(id: Snowflake): Promise<AnyChannelRow | null> {
    const [row] = await db.select().from(channels).where(eq(channels.id, id)).limit(1)
    return row ?? null
  },

  async findInGuild(guildId: Snowflake, id: Snowflake): Promise<ChannelRow | null> {
    const [row] = await db
      .select()
      .from(channels)
      .where(and(eq(channels.guildId, guildId), eq(channels.id, id)))
      .limit(1)
    return (row as ChannelRow | undefined) ?? null
  },

  async update(
    id: Snowflake,
    changes: Partial<
      Pick<
        ChannelRow,
        'name' | 'topic' | 'parentId' | 'position' | 'rateLimitPerUser' | 'nsfw' | 'announcement'
      >
    >,
  ): Promise<ChannelRow> {
    const [row] = await db.update(channels).set(changes).where(eq(channels.id, id)).returning()
    return row as unknown as ChannelRow
  },

  /** Highest position among channels sharing the same parent (top level when null). */
  async maxSiblingPosition(guildId: Snowflake, parentId: Snowflake | null): Promise<number | null> {
    const [row] = await db
      .select({ value: max(channels.position) })
      .from(channels)
      .where(
        and(
          eq(channels.guildId, guildId),
          parentId === null ? isNull(channels.parentId) : eq(channels.parentId, parentId),
        ),
      )
    return row?.value ?? null
  },

  async delete(id: Snowflake): Promise<void> {
    await db.delete(channels).where(eq(channels.id, id))
  },
})

export type ChannelRepository = ReturnType<typeof createChannelRepository>
