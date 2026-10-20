import { and, eq, gt, isNull } from 'drizzle-orm'

import { emailTokens } from '../../db/schema'

import type { Database } from '../../db/client'
import type { Snowflake } from '@chinchi/shared'

export type EmailTokenPurpose = (typeof emailTokens.purpose.enumValues)[number]

export interface NewEmailToken {
  readonly id: Snowflake
  readonly userId: Snowflake
  readonly purpose: EmailTokenPurpose
  readonly tokenHash: string
  readonly expiresAt: Date
  readonly newEmail?: string
}

export const createEmailTokenRepository = (db: Database) => ({
  async insert(token: NewEmailToken): Promise<void> {
    await db.insert(emailTokens).values(token)
  },

  /** Spends every unused token of a purpose (e.g. old reset links once the password changed). */
  async discardUnused(userId: Snowflake, purpose: EmailTokenPurpose, now: Date): Promise<void> {
    await db
      .update(emailTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(emailTokens.userId, userId),
          eq(emailTokens.purpose, purpose),
          isNull(emailTokens.usedAt),
        ),
      )
  },

  /**
   * Marks a valid token as used and returns its owner. A single conditional UPDATE makes the
   * token single-use even under concurrent requests.
   */
  async consume(
    tokenHash: string,
    purpose: EmailTokenPurpose,
    now: Date,
  ): Promise<Snowflake | null> {
    const [row] = await db
      .update(emailTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(emailTokens.tokenHash, tokenHash),
          eq(emailTokens.purpose, purpose),
          isNull(emailTokens.usedAt),
          gt(emailTokens.expiresAt, now),
        ),
      )
      .returning({ userId: emailTokens.userId })
    return row?.userId ?? null
  },

  /** Like `consume`, for a change of address: the owner and the address the link confirms. */
  async consumeEmailChange(
    tokenHash: string,
    now: Date,
  ): Promise<{ userId: Snowflake; newEmail: string } | null> {
    const [row] = await db
      .update(emailTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(emailTokens.tokenHash, tokenHash),
          eq(emailTokens.purpose, 'change_email'),
          isNull(emailTokens.usedAt),
          gt(emailTokens.expiresAt, now),
        ),
      )
      .returning({ userId: emailTokens.userId, newEmail: emailTokens.newEmail })
    return row?.newEmail ? { userId: row.userId, newEmail: row.newEmail } : null
  },
})

export type EmailTokenRepository = ReturnType<typeof createEmailTokenRepository>
