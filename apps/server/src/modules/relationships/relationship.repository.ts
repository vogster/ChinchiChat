import { and, asc, eq, or, sql } from 'drizzle-orm'

import { relationships, users } from '../../db/schema'

import type { DbExecutor } from '../../db/client'
import type { UserRow } from '../users/user.repository'
import type { RelationshipType, Snowflake } from '@chinchi/shared'

export type RelationshipRow = typeof relationships.$inferSelect

export interface RelationshipWithUser {
  readonly relationship: RelationshipRow
  readonly user: UserRow
}

export const createRelationshipRepository = (db: DbExecutor) => ({
  async find(userId: Snowflake, targetId: Snowflake): Promise<RelationshipRow | null> {
    const [row] = await db
      .select()
      .from(relationships)
      .where(and(eq(relationships.userId, userId), eq(relationships.targetId, targetId)))
      .limit(1)
    return row ?? null
  },

  /** Both sides between two people in one query: what `a` set for `b`, and back. */
  async between(
    a: Snowflake,
    b: Snowflake,
  ): Promise<{ mine: RelationshipRow | null; theirs: RelationshipRow | null }> {
    const rows = await db
      .select()
      .from(relationships)
      .where(
        or(
          and(eq(relationships.userId, a), eq(relationships.targetId, b)),
          and(eq(relationships.userId, b), eq(relationships.targetId, a)),
        ),
      )
    return {
      mine: rows.find((row) => row.userId === a) ?? null,
      theirs: rows.find((row) => row.userId === b) ?? null,
    }
  },

  async list(userId: Snowflake): Promise<RelationshipWithUser[]> {
    return db
      .select({ relationship: relationships, user: users })
      .from(relationships)
      .innerJoin(users, eq(users.id, relationships.targetId))
      .where(eq(relationships.userId, userId))
      .orderBy(asc(relationships.createdAt))
  },

  /** Creates or changes one side; returns the stored row. */
  async set(
    userId: Snowflake,
    targetId: Snowflake,
    type: RelationshipType,
  ): Promise<RelationshipRow> {
    const [row] = await db
      .insert(relationships)
      .values({ userId, targetId, type })
      .onConflictDoUpdate({
        target: [relationships.userId, relationships.targetId],
        set: { type, createdAt: new Date() },
      })
      .returning()
    return row as RelationshipRow
  },

  /**
   * Serialises changes to one pair until the transaction ends. Call first, inside a transaction,
   * then read and write: two requests about the same pair never act on stale rows.
   */
  async lockPair(a: Snowflake, b: Snowflake): Promise<void> {
    const key = BigInt(a) < BigInt(b) ? `${a}:${b}` : `${b}:${a}`
    await db.execute(sql`select pg_advisory_xact_lock(hashtext(${`relationship:${key}`}))`)
  },

  async friendIdsOf(userId: Snowflake): Promise<Snowflake[]> {
    const rows = await db
      .select({ id: relationships.targetId })
      .from(relationships)
      .where(and(eq(relationships.userId, userId), eq(relationships.type, 'friend')))
    return rows.map((row) => row.id)
  },

  /** Everyone whose friends list, requests or blocks show this user. */
  async holdersOf(targetId: Snowflake): Promise<Snowflake[]> {
    const rows = await db
      .select({ id: relationships.userId })
      .from(relationships)
      .where(eq(relationships.targetId, targetId))
    return rows.map((row) => row.id)
  },

  /** People the user blocked or who blocked the user. */
  async blockedAround(userId: Snowflake): Promise<Snowflake[]> {
    const rows = await db
      .select({ userId: relationships.userId, targetId: relationships.targetId })
      .from(relationships)
      .where(
        and(
          eq(relationships.type, 'blocked'),
          or(eq(relationships.userId, userId), eq(relationships.targetId, userId)),
        ),
      )
    return rows.map((row) => (row.userId === userId ? row.targetId : row.userId))
  },

  async remove(userId: Snowflake, targetId: Snowflake): Promise<void> {
    await db
      .delete(relationships)
      .where(and(eq(relationships.userId, userId), eq(relationships.targetId, targetId)))
  },
})

export type RelationshipRepository = ReturnType<typeof createRelationshipRepository>
