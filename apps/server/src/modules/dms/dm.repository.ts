import { and, desc, eq, gt, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'

import { channelRecipients, channels, readStates, users } from '../../db/schema'

import type { DbExecutor } from '../../db/client'
import type { AnyChannelRow } from '../channels/channel.repository'
import type { UserRow } from '../users/user.repository'
import type { Snowflake } from '@chinchi/shared'

/** The key of a 1:1 DM: both ids, the smaller first (as numbers). */
export const dmKeyOf = (a: Snowflake, b: Snowflake) =>
  BigInt(a) < BigInt(b) ? `${a}:${b}` : `${b}:${a}`

export const createDmRepository = (db: DbExecutor) => ({
  async recipientIds(channelId: Snowflake): Promise<Snowflake[]> {
    const rows = await db
      .select({ userId: channelRecipients.userId })
      .from(channelRecipients)
      .where(eq(channelRecipients.channelId, channelId))
    return rows.map((row) => row.userId)
  },

  async isRecipient(channelId: Snowflake, userId: Snowflake): Promise<boolean> {
    const [row] = await db
      .select({ userId: channelRecipients.userId })
      .from(channelRecipients)
      .where(and(eq(channelRecipients.channelId, channelId), eq(channelRecipients.userId, userId)))
      .limit(1)
    return row !== undefined
  },

  /** Everyone who shares a DM with the user. */
  async peerIdsOf(userId: Snowflake): Promise<Snowflake[]> {
    const mine = db
      .select({ channelId: channelRecipients.channelId })
      .from(channelRecipients)
      .where(eq(channelRecipients.userId, userId))
    const rows = await db
      .selectDistinct({ userId: channelRecipients.userId })
      .from(channelRecipients)
      .where(
        and(
          inArray(channelRecipients.channelId, mine),
          sql`${channelRecipients.userId} <> ${userId}`,
        ),
      )
    return rows.map((row) => row.userId)
  },

  /** The user's DMs, most recently active first. */
  async listForUser(userId: Snowflake): Promise<AnyChannelRow[]> {
    const rows = await db
      .select({ channel: channels })
      .from(channelRecipients)
      .innerJoin(channels, eq(channels.id, channelRecipients.channelId))
      .where(
        and(
          eq(channelRecipients.userId, userId),
          isNull(channels.guildId),
          // Hidden ones come back once a newer message arrives.
          or(
            isNull(channelRecipients.hiddenThrough),
            gt(channels.lastMessageId, channelRecipients.hiddenThrough),
          ),
        ),
      )
      .orderBy(sql`${channels.lastMessageId} desc nulls last`, desc(channels.id))
    return rows.map((row) => row.channel)
  },

  /** Members of each channel, as users. */
  async recipientsOf(channelIds: readonly Snowflake[]): Promise<Map<Snowflake, UserRow[]>> {
    if (channelIds.length === 0) return new Map()
    const rows = await db
      .select({ channelId: channelRecipients.channelId, user: users })
      .from(channelRecipients)
      .innerJoin(users, eq(users.id, channelRecipients.userId))
      .where(inArray(channelRecipients.channelId, [...channelIds]))
      .orderBy(channelRecipients.createdAt)
    const byChannel = new Map<Snowflake, UserRow[]>()
    for (const { channelId, user } of rows) {
      byChannel.set(channelId, [...(byChannel.get(channelId) ?? []), user])
    }
    return byChannel
  },

  /** A channel without a server, or null. */
  async findPrivate(channelId: Snowflake): Promise<AnyChannelRow | null> {
    const [row] = await db
      .select()
      .from(channels)
      .where(and(eq(channels.id, channelId), isNull(channels.guildId)))
      .limit(1)
    return row ?? null
  },

  async createGroup(
    id: Snowflake,
    ownerId: Snowflake,
    memberIds: readonly Snowflake[],
    { encrypted = false }: { encrypted?: boolean } = {},
  ): Promise<AnyChannelRow> {
    return db.transaction(async (tx) => {
      const [channel] = await tx
        .insert(channels)
        .values({ id, guildId: null, type: 'group_dm', name: '', ownerId, encrypted })
        .returning()
      await tx
        .insert(channelRecipients)
        .values(memberIds.map((userId) => ({ channelId: id, userId })))
      return channel as AnyChannelRow
    })
  },

  /**
   * Adds a member for `actorId`. The channel row lock serialises concurrent changes, so the
   * member cap holds and an actor removed a moment ago can no longer add anyone.
   * The newcomer starts with the history read: joining is not a pile of unread messages.
   */
  async addRecipientChecked(
    channelId: Snowflake,
    actorId: Snowflake,
    userId: Snowflake,
    max: number,
  ): Promise<'added' | 'exists' | 'full' | 'not_member'> {
    return db.transaction(async (tx) => {
      const [channel] = await tx
        .select({ lastMessageId: channels.lastMessageId })
        .from(channels)
        .where(eq(channels.id, channelId))
        .for('update')
      const members = await tx
        .select({ userId: channelRecipients.userId })
        .from(channelRecipients)
        .where(eq(channelRecipients.channelId, channelId))
      const ids = members.map((member) => member.userId)
      if (!channel || !ids.includes(actorId)) return 'not_member'
      if (ids.includes(userId)) return 'exists'
      if (ids.length >= max) return 'full'
      await tx.insert(channelRecipients).values({ channelId, userId })
      if (channel.lastMessageId) {
        await tx
          .insert(readStates)
          .values({ userId, channelId, lastReadMessageId: channel.lastMessageId })
          .onConflictDoUpdate({
            target: [readStates.userId, readStates.channelId],
            set: { lastReadMessageId: channel.lastMessageId, updatedAt: new Date() },
          })
      }
      return 'added'
    })
  },

  /**
   * Takes `userId` out on behalf of `actorId`: anyone may leave, only the owner removes others
   * (any member, if the owner's account is gone). Checked under the channel row lock.
   * Ownership passes to whoever has been in the group longest, and the last one out deletes it.
   */
  async removeRecipient(
    channelId: Snowflake,
    actorId: Snowflake,
    userId: Snowflake,
  ): Promise<
    | { readonly result: 'removed'; readonly channel: AnyChannelRow | null }
    | { readonly result: 'not_member' | 'forbidden' | 'absent' }
  > {
    return db.transaction(async (tx) => {
      const [channel] = await tx
        .select()
        .from(channels)
        .where(eq(channels.id, channelId))
        .for('update')
      const members = await tx
        .select({ userId: channelRecipients.userId })
        .from(channelRecipients)
        .where(eq(channelRecipients.channelId, channelId))
      const ids = members.map((member) => member.userId)
      if (!channel || !ids.includes(actorId)) return { result: 'not_member' as const }
      if (actorId !== userId && channel.ownerId !== null && channel.ownerId !== actorId) {
        return { result: 'forbidden' as const }
      }
      if (!ids.includes(userId)) return { result: 'absent' as const }
      await tx
        .delete(channelRecipients)
        .where(
          and(eq(channelRecipients.channelId, channelId), eq(channelRecipients.userId, userId)),
        )
      const [next] = await tx
        .select({ userId: channelRecipients.userId })
        .from(channelRecipients)
        .where(eq(channelRecipients.channelId, channelId))
        .orderBy(channelRecipients.createdAt, channelRecipients.userId)
        .limit(1)
      if (!next) {
        await tx.delete(channels).where(eq(channels.id, channelId))
        return { result: 'removed' as const, channel: null }
      }
      if (channel.ownerId !== userId) return { result: 'removed' as const, channel }
      const [updated] = await tx
        .update(channels)
        .set({ ownerId: next.userId })
        .where(eq(channels.id, channelId))
        .returning()
      return { result: 'removed' as const, channel: updated ?? channel }
    })
  },

  /**
   * Deletes an encrypted conversation on behalf of `actorId` (a member; in a group, its owner),
   * under the channel row lock; its rows go with it (cascade). Returns who was in it.
   */
  async deleteEncrypted(
    channelId: Snowflake,
    actorId: Snowflake,
  ): Promise<
    | { readonly result: 'deleted'; readonly memberIds: Snowflake[] }
    | { readonly result: 'not_member' | 'not_encrypted' | 'forbidden' }
  > {
    return db.transaction(async (tx) => {
      const [channel] = await tx
        .select()
        .from(channels)
        .where(and(eq(channels.id, channelId), isNull(channels.guildId)))
        .for('update')
      const members = await tx
        .select({ userId: channelRecipients.userId })
        .from(channelRecipients)
        .where(eq(channelRecipients.channelId, channelId))
      const memberIds = members.map((member) => member.userId)
      if (!channel || !memberIds.includes(actorId)) return { result: 'not_member' as const }
      if (!channel.encrypted) return { result: 'not_encrypted' as const }
      if (channel.type === 'group_dm' && channel.ownerId !== null && channel.ownerId !== actorId) {
        return { result: 'forbidden' as const }
      }
      await tx.delete(channels).where(eq(channels.id, channelId))
      return { result: 'deleted' as const, memberIds }
    })
  },

  async rename(channelId: Snowflake, name: string): Promise<AnyChannelRow | null> {
    const [row] = await db
      .update(channels)
      .set({ name })
      .where(eq(channels.id, channelId))
      .returning()
    return row ?? null
  },

  /** The pair's DM, created if missing; concurrent opens end up with the same channel. */
  async openDm(
    id: Snowflake,
    a: Snowflake,
    b: Snowflake,
    { encrypted = false }: { encrypted?: boolean } = {},
  ): Promise<{ channel: AnyChannelRow; created: boolean }> {
    // The encrypted conversation is the pair's second channel, never shared with the plain one.
    const dmKey = encrypted ? `e2ee:${dmKeyOf(a, b)}` : dmKeyOf(a, b)
    return db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(channels)
        .values({ id, guildId: null, type: 'dm', name: '', dmKey, encrypted })
        .onConflictDoNothing({ target: channels.dmKey })
        .returning()
      if (inserted) {
        await tx.insert(channelRecipients).values([
          { channelId: id, userId: a },
          { channelId: id, userId: b },
        ])
        return { channel: inserted, created: true }
      }
      const [existing] = await tx.select().from(channels).where(eq(channels.dmKey, dmKey))
      return { channel: existing as AnyChannelRow, created: false }
    })
  },

  /**
   * Hides a private channel from one member's list up to its latest message (the channel's own
   * id when it has none). Null when the user is not in such a channel.
   */
  async hide(channelId: Snowflake, userId: Snowflake): Promise<Snowflake | null> {
    const latest = db
      .select({ through: sql`coalesce(${channels.lastMessageId}, ${channels.id})` })
      .from(channels)
      .where(and(eq(channels.id, channelId), isNull(channels.guildId)))
    const [row] = await db
      .update(channelRecipients)
      .set({ hiddenThrough: sql`(${latest})` })
      .where(and(eq(channelRecipients.channelId, channelId), eq(channelRecipients.userId, userId)))
      .returning({ hiddenThrough: channelRecipients.hiddenThrough })
    return row?.hiddenThrough ?? null
  },

  /** Shows the channel again to whoever hid it (all members, or one); returns who that was. */
  async unhide(channelId: Snowflake, userId?: Snowflake): Promise<Snowflake[]> {
    const rows = await db
      .update(channelRecipients)
      .set({ hiddenThrough: null })
      .where(
        and(
          eq(channelRecipients.channelId, channelId),
          isNotNull(channelRecipients.hiddenThrough),
          userId === undefined ? undefined : eq(channelRecipients.userId, userId),
        ),
      )
      .returning({ userId: channelRecipients.userId })
    return rows.map((row) => row.userId)
  },
})

export type DmRepository = ReturnType<typeof createDmRepository>
