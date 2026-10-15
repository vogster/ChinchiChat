import { eq, inArray, or, sql } from 'drizzle-orm'

import { uniqueViolationConstraint } from '../../db/errors'
import { users } from '../../db/schema'

import type { Database } from '../../db/client'
import type { DmPolicy, Snowflake } from '@chinchi/shared'

export type UserRow = typeof users.$inferSelect
export type NewUser = Pick<typeof users.$inferInsert, 'id' | 'username' | 'email' | 'passwordHash'>

export type InsertUserResult =
  | { readonly ok: true; readonly user: UserRow }
  | { readonly ok: false; readonly reason: 'username_taken' | 'email_taken' }

const CONSTRAINT_REASONS: Readonly<Record<string, 'username_taken' | 'email_taken'>> = {
  users_username_lower_idx: 'username_taken',
  users_email_lower_idx: 'email_taken',
}

export const createUserRepository = (db: Database) => ({
  async insert(user: NewUser): Promise<InsertUserResult> {
    try {
      const [created] = await db.insert(users).values(user).returning()
      return { ok: true, user: created as UserRow }
    } catch (error) {
      const constraint = uniqueViolationConstraint(error)
      const reason = constraint ? CONSTRAINT_REASONS[constraint] : undefined
      if (reason) return { ok: false, reason }
      throw error
    }
  },

  /** Matches a username or an email, case-insensitively (backed by the lower() indexes). */
  async findByLogin(login: string): Promise<UserRow | null> {
    const normalized = login.toLowerCase()
    const [user] = await db
      .select()
      .from(users)
      .where(
        or(
          eq(sql`lower(${users.username})`, normalized),
          eq(sql`lower(${users.email})`, normalized),
        ),
      )
      .limit(1)
    return user ?? null
  },

  /** Case-insensitive, like sign-in (backed by the lower() index). */
  async findByUsername(username: string): Promise<UserRow | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(sql`lower(${users.username})`, username.toLowerCase()))
      .limit(1)
    return user ?? null
  },

  async findById(id: Snowflake): Promise<UserRow | null> {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1)
    return user ?? null
  },

  async findByIds(ids: readonly Snowflake[]): Promise<UserRow[]> {
    if (ids.length === 0) return []
    return db
      .select()
      .from(users)
      .where(inArray(users.id, [...ids]))
  },

  async findByEmail(email: string): Promise<UserRow | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(sql`lower(${users.email})`, email.toLowerCase()))
      .limit(1)
    return user ?? null
  },

  /** Sets verification time only if not set yet; returns the up-to-date user. */
  async markEmailVerified(id: Snowflake, at: Date): Promise<UserRow | null> {
    const [user] = await db
      .update(users)
      .set({
        // Raw sql params bypass Drizzle's Date mapping, so pass an explicit timestamptz.
        emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, ${at.toISOString()}::timestamptz)`,
        updatedAt: at,
      })
      .where(eq(users.id, id))
      .returning()
    return user ?? null
  },

  /** Changes only the fields given. */
  async updateProfile(
    id: Snowflake,
    profile: {
      displayName?: string | null | undefined
      bio?: string | null | undefined
      dmPolicy?: DmPolicy | undefined
      accentColor?: number | null | undefined
    },
  ): Promise<UserRow> {
    const [user] = await db
      .update(users)
      .set({
        ...(profile.displayName !== undefined ? { displayName: profile.displayName } : {}),
        ...(profile.dmPolicy !== undefined ? { dmPolicy: profile.dmPolicy } : {}),
        ...(profile.accentColor !== undefined ? { accentColor: profile.accentColor } : {}),
        // An emptied bio is no bio.
        ...(profile.bio !== undefined ? { bio: profile.bio || null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning()
    return user as UserRow
  },

  /** Sets the avatar and returns the id it replaced, read under a row lock (races are safe). */
  async replaceAvatar(
    id: Snowflake,
    avatarId: Snowflake | null,
  ): Promise<{ user: UserRow; previousId: Snowflake | null }> {
    return db.transaction(async (tx) => {
      const [current] = await tx
        .select({ avatarId: users.avatarId })
        .from(users)
        .where(eq(users.id, id))
        .for('update')
      const [user] = await tx
        .update(users)
        .set({ avatarId, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning()
      return { user: user as UserRow, previousId: current?.avatarId ?? null }
    })
  },

  async replaceBanner(
    id: Snowflake,
    bannerId: Snowflake | null,
  ): Promise<{ user: UserRow; previousId: Snowflake | null }> {
    return db.transaction(async (tx) => {
      const [current] = await tx
        .select({ bannerId: users.bannerId })
        .from(users)
        .where(eq(users.id, id))
        .for('update')
      const [user] = await tx
        .update(users)
        .set({ bannerId, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning()
      return { user: user as UserRow, previousId: current?.bannerId ?? null }
    })
  },

  async updatePasswordHash(id: Snowflake, passwordHash: string): Promise<void> {
    await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, id))
  },
})

export type UserRepository = ReturnType<typeof createUserRepository>
