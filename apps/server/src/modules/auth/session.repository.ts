import { and, desc, eq, gt, isNull, ne } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { sessions, users } from '../../db/schema'

import type { Database } from '../../db/client'
import type { UserRow } from '../users/user.repository'
import type { Snowflake } from '@chinchi/shared'

export type SessionRow = typeof sessions.$inferSelect
export type NewSession = Pick<
  typeof sessions.$inferInsert,
  'id' | 'userId' | 'tokenHash' | 'userAgent' | 'ipAddress' | 'expiresAt'
>

export interface SessionWithUser {
  readonly session: SessionRow
  readonly user: UserRow
}

/** A bot's owner: their suspension stops the bot too. */
const owners = alias(users, 'owners')

export const createSessionRepository = (db: Database) => ({
  async insert(session: NewSession): Promise<SessionRow> {
    const [created] = await db.insert(sessions).values(session).returning()
    return created as SessionRow
  },

  async findActiveByTokenHash(tokenHash: string, now: Date): Promise<SessionWithUser | null> {
    const [row] = await db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .leftJoin(owners, eq(owners.id, users.botOwnerId))
      .where(
        and(
          eq(sessions.tokenHash, tokenHash),
          gt(sessions.expiresAt, now),
          isNull(owners.suspendedAt),
        ),
      )
      .limit(1)
    return row ?? null
  },

  async touch(id: Snowflake, lastUsedAt: Date, expiresAt: Date): Promise<void> {
    await db.update(sessions).set({ lastUsedAt, expiresAt }).where(eq(sessions.id, id))
  },

  async delete(id: Snowflake): Promise<void> {
    await db.delete(sessions).where(eq(sessions.id, id))
  },

  async deleteAllForUser(userId: Snowflake): Promise<void> {
    await db.delete(sessions).where(eq(sessions.userId, userId))
  },

  async listActiveForUser(userId: Snowflake, now: Date): Promise<SessionRow[]> {
    return db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, now)))
      .orderBy(desc(sessions.lastUsedAt))
  },

  /** Deletes the session only if it belongs to the user; returns whether anything was deleted. */
  async deleteOwned(id: Snowflake, userId: Snowflake): Promise<boolean> {
    const deleted = await db
      .delete(sessions)
      .where(and(eq(sessions.id, id), eq(sessions.userId, userId)))
      .returning({ id: sessions.id })
    return deleted.length > 0
  },

  async deleteOthersForUser(userId: Snowflake, keepId: Snowflake): Promise<void> {
    await db.delete(sessions).where(and(eq(sessions.userId, userId), ne(sessions.id, keepId)))
  },
})

export type SessionRepository = ReturnType<typeof createSessionRepository>
