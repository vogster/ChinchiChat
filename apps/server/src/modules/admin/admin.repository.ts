import { and, count, desc, eq, ilike, isNull, lt, ne, or, sql } from 'drizzle-orm'

import { badRequest } from '../../http/http-error'

import { guildMembers, guilds, users } from '../../db/schema'

import type { Database } from '../../db/client'
import type { GuildRow } from '../guilds/guild.repository'
import type { UserRow } from '../users/user.repository'
import type { Snowflake } from '@chinchi/shared'

interface Page {
  readonly query?: string | undefined
  readonly before?: Snowflake | undefined
  readonly limit: number
}

/** `%`, `_` and `\` are wildcards in LIKE; a search for them should match them literally. */
const containing = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

const lockAdmins = async (tx: Parameters<Parameters<Database['transaction']>[0]>[0]) => {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('instance-admins', 0))`)
}

/** Whole-instance reads and writes for admins (no per-server permissions apply). */
export const createAdminRepository = (db: Database) => ({
  async listUsers({ query, before, limit }: Page): Promise<UserRow[]> {
    return db
      .select()
      .from(users)
      .where(
        and(
          before ? lt(users.id, before) : undefined,
          query
            ? or(ilike(users.username, containing(query)), ilike(users.email, containing(query)))
            : undefined,
        ),
      )
      .orderBy(desc(users.id))
      .limit(limit)
  },

  async listGuilds({
    query,
    before,
    limit,
  }: Page): Promise<{ guild: GuildRow; owner: UserRow | null; memberCount: number }[]> {
    const members = db
      .select({ guildId: guildMembers.guildId, total: count().as('total') })
      .from(guildMembers)
      .groupBy(guildMembers.guildId)
      .as('members')
    const rows = await db
      .select({ guild: guilds, owner: users, memberCount: members.total })
      .from(guilds)
      .leftJoin(users, eq(users.id, guilds.ownerId))
      .leftJoin(members, eq(members.guildId, guilds.id))
      .where(
        and(
          before ? lt(guilds.id, before) : undefined,
          query ? ilike(guilds.name, containing(query)) : undefined,
        ),
      )
      .orderBy(desc(guilds.id))
      .limit(limit)
    return rows.map((row) => ({ ...row, memberCount: Number(row.memberCount ?? 0) }))
  },

  async countOwnedGuilds(userId: Snowflake): Promise<number> {
    const [row] = await db.select({ total: count() }).from(guilds).where(eq(guilds.ownerId, userId))
    return Number(row?.total ?? 0)
  },

  /**
   * Changes admin rights or suspension. Serialized instance-wide, and refuses to leave no
   * active admin (two admins demoting each other at once can't both win).
   */
  async botIdsOf(ownerId: Snowflake): Promise<Snowflake[]> {
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.botOwnerId, ownerId))
    return rows.map((row) => row.id)
  },

  /** Whether removing this account (or its admin rights) would leave no active admin. */
  async isLastAdmin(userId: Snowflake): Promise<boolean> {
    const [target] = await db
      .select({ isAdmin: users.isAdmin })
      .from(users)
      .where(eq(users.id, userId))
    if (!target?.isAdmin) return false
    const [others] = await db
      .select({ total: count() })
      .from(users)
      .where(and(eq(users.isAdmin, true), isNull(users.suspendedAt), ne(users.id, userId)))
    return Number(others?.total ?? 0) === 0
  },

  /** Deletes an account (its rows cascade); refuses to remove the last active admin. */
  async deleteUser(userId: Snowflake): Promise<boolean> {
    return db.transaction(async (tx) => {
      await lockAdmins(tx)
      const [target] = await tx.select().from(users).where(eq(users.id, userId))
      if (!target) return false
      if (target.isAdmin) {
        const [others] = await tx
          .select({ total: count() })
          .from(users)
          .where(and(eq(users.isAdmin, true), isNull(users.suspendedAt), ne(users.id, userId)))
        if (Number(others?.total ?? 0) === 0) {
          throw badRequest('LAST_ADMIN', 'The instance needs at least one active admin')
        }
      }
      await tx.delete(users).where(eq(users.id, userId))
      return true
    })
  },

  async update(
    userId: Snowflake,
    changes: { isAdmin?: boolean; suspendedAt?: Date | null },
  ): Promise<UserRow | null> {
    return db.transaction(async (tx) => {
      await lockAdmins(tx)
      const [target] = await tx.select().from(users).where(eq(users.id, userId))
      if (!target) return null
      if (target.isBot && changes.isAdmin) {
        throw badRequest('BOT_CANNOT_ADMIN', 'Bots cannot run the instance')
      }
      const losesAdmin =
        target.isAdmin && (changes.isAdmin === false || (changes.suspendedAt ?? null) !== null)
      if (losesAdmin) {
        const [others] = await tx
          .select({ total: count() })
          .from(users)
          .where(and(eq(users.isAdmin, true), isNull(users.suspendedAt), ne(users.id, userId)))
        if (Number(others?.total ?? 0) === 0) {
          throw badRequest('LAST_ADMIN', 'The instance needs at least one active admin')
        }
      }
      const [row] = await tx.update(users).set(changes).where(eq(users.id, userId)).returning()
      return row ?? null
    })
  },

  /**
   * The designated first admin (INITIAL_ADMIN_EMAIL) becomes admin only while nobody runs the
   * instance: once there is an admin, that address is no shortcut (it could be re-registered).
   */
  async promoteIfNoAdmin(userId: Snowflake): Promise<boolean> {
    return db.transaction(async (tx) => {
      await lockAdmins(tx)
      const promoted = await tx
        .update(users)
        .set({ isAdmin: true })
        .where(and(eq(users.id, userId), sql`not exists (select 1 from users where is_admin)`))
        .returning({ id: users.id })
      return promoted.length > 0
    })
  },

  /**
   * Makes the account an admin if it is the instance's first and nobody runs it yet.
   * Serialized, so two simultaneous first sign-ups can't both win.
   */
  async promoteIfFirst(userId: Snowflake): Promise<boolean> {
    return db.transaction(async (tx) => {
      await lockAdmins(tx)
      const promoted = await tx
        .update(users)
        .set({ isAdmin: true })
        .where(
          and(
            eq(users.id, userId),
            sql`${users.id} = (select min(id) from users)`,
            sql`not exists (select 1 from users where is_admin)`,
          ),
        )
        .returning({ id: users.id })
      return promoted.length > 0
    })
  },

  async hasAdmin(): Promise<boolean> {
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.isAdmin, true))
      .limit(1)
    return row !== undefined
  },
})

export type AdminRepository = ReturnType<typeof createAdminRepository>
