import { and, desc, eq, sql } from 'drizzle-orm'

import { guildBans, guildMembers, users } from '../../db/schema'

import type { DbExecutor } from '../../db/client'
import type { UserRow } from '../users/user.repository'
import type { Snowflake } from '@chinchi/shared'

export type BanRow = typeof guildBans.$inferSelect

/**
 * Serializes joining and banning for one person on one server (until the transaction ends),
 * so an invite accepted while a ban lands can't slip them back in.
 */
export const lockMembership = async (db: DbExecutor, guildId: Snowflake, userId: Snowflake) => {
  await db.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`membership:${guildId}:${userId}`}, 0))`,
  )
}

export const createBanRepository = (db: DbExecutor) => ({
  /**
   * Bans (again: a second ban updates the reason and who banned) and removes the member.
   * True when they were a member.
   */
  async banAndRemove(ban: {
    guildId: Snowflake
    userId: Snowflake
    reason: string | null
    bannedBy: Snowflake
  }): Promise<boolean> {
    return db.transaction(async (tx) => {
      await lockMembership(tx, ban.guildId, ban.userId)
      await tx
        .insert(guildBans)
        .values(ban)
        .onConflictDoUpdate({
          target: [guildBans.guildId, guildBans.userId],
          set: { reason: ban.reason, bannedBy: ban.bannedBy, createdAt: new Date() },
        })
      const removed = await tx
        .delete(guildMembers)
        .where(and(eq(guildMembers.guildId, ban.guildId), eq(guildMembers.userId, ban.userId)))
        .returning({ userId: guildMembers.userId })
      return removed.length > 0
    })
  },

  /** True when there was a ban to lift. */
  async remove(guildId: Snowflake, userId: Snowflake): Promise<boolean> {
    const removed = await db
      .delete(guildBans)
      .where(and(eq(guildBans.guildId, guildId), eq(guildBans.userId, userId)))
      .returning({ userId: guildBans.userId })
    return removed.length > 0
  },

  async isBanned(guildId: Snowflake, userId: Snowflake): Promise<boolean> {
    const [row] = await db
      .select({ userId: guildBans.userId })
      .from(guildBans)
      .where(and(eq(guildBans.guildId, guildId), eq(guildBans.userId, userId)))
      .limit(1)
    return row !== undefined
  },

  async list(guildId: Snowflake): Promise<{ ban: BanRow; user: UserRow }[]> {
    return db
      .select({ ban: guildBans, user: users })
      .from(guildBans)
      .innerJoin(users, eq(users.id, guildBans.userId))
      .where(eq(guildBans.guildId, guildId))
      .orderBy(desc(guildBans.createdAt))
  },
})

export type BanRepository = ReturnType<typeof createBanRepository>
