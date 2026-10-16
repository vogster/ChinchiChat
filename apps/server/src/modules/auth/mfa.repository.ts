import { and, eq, isNull, lt, or } from 'drizzle-orm'

import { mfaRecoveryCodes, users } from '../../db/schema'

import type { Database } from '../../db/client'
import type { Snowflake } from '@chinchi/shared'

export const createMfaRepository = (db: Database) => {
  const replaceCodes = async (
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    userId: Snowflake,
    codeHashes: readonly string[],
  ) => {
    await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId))
    await tx.insert(mfaRecoveryCodes).values(codeHashes.map((codeHash) => ({ userId, codeHash })))
  }

  return {
    /** `stored` is the secret as it goes into the database (sealed when a key is set). */
    async setPendingSecret(userId: Snowflake, stored: string): Promise<void> {
      await db.update(users).set({ totpPendingSecret: stored }).where(eq(users.id, userId))
    },

    /**
     * Turns the confirmed pending secret on, with fresh recovery codes. `pendingStored` is the
     * pending value as read (so a setup restarted meanwhile is noticed); false if it changed.
     */
    async enable(
      userId: Snowflake,
      pendingStored: string,
      stored: string,
      step: number,
      codeHashes: readonly string[],
    ): Promise<boolean> {
      return db.transaction(async (tx) => {
        const updated = await tx
          .update(users)
          .set({ totpSecret: stored, totpPendingSecret: null, totpLastStep: step })
          .where(
            and(
              eq(users.id, userId),
              eq(users.totpPendingSecret, pendingStored),
              isNull(users.totpSecret),
            ),
          )
          .returning({ id: users.id })
        if (updated.length === 0) return false
        await replaceCodes(tx, userId, codeHashes)
        return true
      })
    },

    async disable(userId: Snowflake): Promise<void> {
      await db.transaction(async (tx) => {
        await tx
          .update(users)
          .set({ totpSecret: null, totpPendingSecret: null, totpLastStep: null })
          .where(eq(users.id, userId))
        await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId))
      })
    },

    /** Rewrites the stored secret (sealing one stored before a key existed), if unchanged. */
    async reseal(userId: Snowflake, current: string, stored: string): Promise<void> {
      await db
        .update(users)
        .set({ totpSecret: stored })
        .where(and(eq(users.id, userId), eq(users.totpSecret, current)))
    },

    async replaceRecoveryCodes(userId: Snowflake, codeHashes: readonly string[]): Promise<void> {
      await db.transaction((tx) => replaceCodes(tx, userId, codeHashes))
    },

    /** Records an accepted code's step; false when it (or a later one) was already used. */
    async useStep(userId: Snowflake, step: number): Promise<boolean> {
      const updated = await db
        .update(users)
        .set({ totpLastStep: step })
        .where(
          and(eq(users.id, userId), or(isNull(users.totpLastStep), lt(users.totpLastStep, step))),
        )
        .returning({ id: users.id })
      return updated.length > 0
    },

    /** Spends a recovery code; false when there is no such unused code. */
    async useRecoveryCode(userId: Snowflake, codeHash: string, at: Date): Promise<boolean> {
      const updated = await db
        .update(mfaRecoveryCodes)
        .set({ usedAt: at })
        .where(
          and(
            eq(mfaRecoveryCodes.userId, userId),
            eq(mfaRecoveryCodes.codeHash, codeHash),
            isNull(mfaRecoveryCodes.usedAt),
          ),
        )
        .returning({ userId: mfaRecoveryCodes.userId })
      return updated.length > 0
    },
  }
}

export type MfaRepository = ReturnType<typeof createMfaRepository>
