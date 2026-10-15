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
    async setPendingSecret(userId: Snowflake, secret: string): Promise<void> {
      await db.update(users).set({ totpPendingSecret: secret }).where(eq(users.id, userId))
    },

    /** Turns the confirmed pending secret on, with fresh recovery codes. False if it changed. */
    async enable(
      userId: Snowflake,
      secret: string,
      step: number,
      codeHashes: readonly string[],
    ): Promise<boolean> {
      return db.transaction(async (tx) => {
        const updated = await tx
          .update(users)
          .set({ totpSecret: secret, totpPendingSecret: null, totpLastStep: step })
          .where(
            and(
              eq(users.id, userId),
              eq(users.totpPendingSecret, secret),
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
