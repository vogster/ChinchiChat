import { and, asc, count, eq, inArray, sql } from 'drizzle-orm'

import { guildMembers, guilds, pendingTimeouts, users } from '../../db/schema'

import type { DbExecutor } from '../../db/client'
import type { UserRow } from '../users/user.repository'
import type { Snowflake } from '@chinchi/shared'

export type GuildRow = typeof guilds.$inferSelect
export type MemberRow = typeof guildMembers.$inferSelect

export interface MemberWithUser {
  readonly member: MemberRow
  readonly user: UserRow
}

export const createGuildRepository = (db: DbExecutor) => ({
  async insert(guild: Pick<GuildRow, 'id' | 'name' | 'ownerId'>): Promise<GuildRow> {
    const [row] = await db.insert(guilds).values(guild).returning()
    return row as GuildRow
  },

  async findById(id: Snowflake): Promise<GuildRow | null> {
    const [row] = await db.select().from(guilds).where(eq(guilds.id, id)).limit(1)
    return row ?? null
  },

  /** Servers the user belongs to, in the order they joined. */
  async listForUser(userId: Snowflake): Promise<GuildRow[]> {
    const rows = await db
      .select({ guild: guilds })
      .from(guildMembers)
      .innerJoin(guilds, eq(guilds.id, guildMembers.guildId))
      .where(eq(guildMembers.userId, userId))
      .orderBy(asc(guildMembers.joinedAt), asc(guilds.id))
    return rows.map((row) => row.guild)
  },

  async update(
    id: Snowflake,
    changes: Partial<Pick<GuildRow, 'name' | 'ownerId' | 'rules'>>,
  ): Promise<GuildRow> {
    const [row] = await db
      .update(guilds)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(guilds.id, id))
      .returning()
    return row as GuildRow
  },

  /** Sets the icon and returns the id it replaced, read under a row lock (races are safe). */
  async replaceIcon(
    id: Snowflake,
    iconId: Snowflake | null,
  ): Promise<{ guild: GuildRow; previousId: Snowflake | null }> {
    return db.transaction(async (tx) => {
      const [current] = await tx
        .select({ iconId: guilds.iconId })
        .from(guilds)
        .where(eq(guilds.id, id))
        .for('update')
      const [guild] = await tx
        .update(guilds)
        .set({ iconId, updatedAt: new Date() })
        .where(eq(guilds.id, id))
        .returning()
      return { guild: guild as GuildRow, previousId: current?.iconId ?? null }
    })
  },

  async delete(id: Snowflake): Promise<void> {
    await db.delete(guilds).where(eq(guilds.id, id))
  },

  /** `screen`: newcomers to a server with rules start pending until they accept them. */
  async addMember(
    guildId: Snowflake,
    userId: Snowflake,
    { screen = true }: { screen?: boolean } = {},
  ): Promise<boolean> {
    // Someone who left while timed out comes back still timed out.
    const [pending] = await db
      .delete(pendingTimeouts)
      .where(and(eq(pendingTimeouts.guildId, guildId), eq(pendingTimeouts.userId, userId)))
      .returning({ until: pendingTimeouts.until })
    const timeoutUntil = pending && pending.until > new Date() ? pending.until : null
    const [guild] = screen
      ? await db.select({ rules: guilds.rules }).from(guilds).where(eq(guilds.id, guildId))
      : []
    const inserted = await db
      .insert(guildMembers)
      .values({ guildId, userId, timeoutUntil, pending: Boolean(guild?.rules) })
      .onConflictDoNothing()
      .returning({ userId: guildMembers.userId })
    return inserted.length > 0
  },

  async acceptRules(guildId: Snowflake, userId: Snowflake): Promise<boolean> {
    const updated = await db
      .update(guildMembers)
      .set({ pending: false })
      .where(
        and(
          eq(guildMembers.guildId, guildId),
          eq(guildMembers.userId, userId),
          eq(guildMembers.pending, true),
        ),
      )
      .returning({ userId: guildMembers.userId })
    return updated.length > 0
  },

  async findMember(guildId: Snowflake, userId: Snowflake): Promise<MemberRow | null> {
    const [row] = await db
      .select()
      .from(guildMembers)
      .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, userId)))
      .limit(1)
    return row ?? null
  },

  async setNickname(
    guildId: Snowflake,
    userId: Snowflake,
    nickname: string | null,
  ): Promise<MemberRow | null> {
    const [row] = await db
      .update(guildMembers)
      .set({ nickname })
      .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, userId)))
      .returning()
    return row ?? null
  },

  /** Sets a timeout, but never shortens a longer one already running (automod). */
  async extendTimeout(
    guildId: Snowflake,
    userId: Snowflake,
    until: Date,
  ): Promise<MemberRow | null> {
    const [row] = await db
      .update(guildMembers)
      .set({
        timeoutUntil: sql`greatest(coalesce(${guildMembers.timeoutUntil}, now()), ${until.toISOString()}::timestamptz)`,
      })
      .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, userId)))
      .returning()
    return row ?? null
  },

  async setTimeout(
    guildId: Snowflake,
    userId: Snowflake,
    until: Date | null,
  ): Promise<MemberRow | null> {
    const [row] = await db
      .update(guildMembers)
      .set({ timeoutUntil: until })
      .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, userId)))
      .returning()
    return row ?? null
  },

  /** Server mute and deafen; only the given flags change. */
  async setVoiceFlags(
    guildId: Snowflake,
    userId: Snowflake,
    flags: { voiceMute?: boolean | undefined; voiceDeaf?: boolean | undefined },
  ): Promise<MemberRow | null> {
    const [row] = await db
      .update(guildMembers)
      .set({
        ...(flags.voiceMute !== undefined ? { voiceMute: flags.voiceMute } : {}),
        ...(flags.voiceDeaf !== undefined ? { voiceDeaf: flags.voiceDeaf } : {}),
      })
      .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, userId)))
      .returning()
    return row ?? null
  },

  async listMembers(guildId: Snowflake): Promise<MemberWithUser[]> {
    return db
      .select({ member: guildMembers, user: users })
      .from(guildMembers)
      .innerJoin(users, eq(users.id, guildMembers.userId))
      .where(eq(guildMembers.guildId, guildId))
      .orderBy(asc(guildMembers.joinedAt), asc(users.id))
  },

  async countMembers(guildId: Snowflake): Promise<number> {
    const [row] = await db
      .select({ value: count() })
      .from(guildMembers)
      .where(eq(guildMembers.guildId, guildId))
    return row?.value ?? 0
  },

  /** Whether two users are both members of at least one server. */
  async sharesGuild(a: Snowflake, b: Snowflake): Promise<boolean> {
    const mine = db
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(eq(guildMembers.userId, a))
    const [row] = await db
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(and(eq(guildMembers.userId, b), inArray(guildMembers.guildId, mine)))
      .limit(1)
    return row !== undefined
  },

  /** The ids among `userIds` that are members of the server. */
  async filterMembers(guildId: Snowflake, userIds: readonly Snowflake[]): Promise<Snowflake[]> {
    if (userIds.length === 0) return []
    const rows = await db
      .select({ userId: guildMembers.userId })
      .from(guildMembers)
      .where(and(eq(guildMembers.guildId, guildId), inArray(guildMembers.userId, [...userIds])))
    return rows.map((row) => row.userId)
  },

  /** Distinct users across several servers (whose presence a client needs). */
  async listMemberIdsOf(guildIds: readonly Snowflake[]): Promise<Snowflake[]> {
    if (guildIds.length === 0) return []
    const rows = await db
      .selectDistinct({ userId: guildMembers.userId })
      .from(guildMembers)
      .where(inArray(guildMembers.guildId, [...guildIds]))
    return rows.map((row) => row.userId)
  },

  async listGuildIdsOf(userId: Snowflake): Promise<Snowflake[]> {
    const rows = await db
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(eq(guildMembers.userId, userId))
    return rows.map((row) => row.guildId)
  },

  async removeMember(guildId: Snowflake, userId: Snowflake): Promise<void> {
    const [removed] = await db
      .delete(guildMembers)
      .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, userId)))
      .returning({ timeoutUntil: guildMembers.timeoutUntil })
    const until = removed?.timeoutUntil
    if (until && until > new Date()) {
      await db
        .insert(pendingTimeouts)
        .values({ guildId, userId, until })
        .onConflictDoUpdate({
          target: [pendingTimeouts.guildId, pendingTimeouts.userId],
          set: { until },
        })
    }
  },
})

export type GuildRepository = ReturnType<typeof createGuildRepository>
