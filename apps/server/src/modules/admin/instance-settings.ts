import { and, desc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm'

import { instanceInvites, instanceSettings, users } from '../../db/schema'

import type { Database } from '../../db/client'
import type { UserRow } from '../users/user.repository'
import type { InstanceSettings, RegistrationMode } from '@chinchi/shared'

export type InstanceInviteRow = typeof instanceInvites.$inferSelect

/** Runtime instance settings (one row); environment variables give the defaults. */
export const createInstanceSettings = (
  db: Database,
  defaults: { readonly registrationMode: RegistrationMode },
) => ({
  async get(): Promise<InstanceSettings> {
    const [row] = await db.select().from(instanceSettings).where(eq(instanceSettings.id, 1))
    return {
      registrationMode: row?.registrationMode ?? defaults.registrationMode,
      maxGuildsPerUser: row?.maxGuildsPerUser ?? null,
    }
  },

  async update(changes: Partial<InstanceSettings>): Promise<void> {
    const values = { ...changes, updatedAt: new Date() }
    await db
      .insert(instanceSettings)
      .values({ id: 1, ...values })
      .onConflictDoUpdate({ target: instanceSettings.id, set: values })
  },
})

export type InstanceSettingsStore = ReturnType<typeof createInstanceSettings>

export const createInstanceInviteRepository = (db: Database) => ({
  async insert(invite: typeof instanceInvites.$inferInsert): Promise<InstanceInviteRow> {
    const [row] = await db.insert(instanceInvites).values(invite).returning()
    return row as InstanceInviteRow
  },

  async list(): Promise<{ invite: InstanceInviteRow; creator: UserRow | null }[]> {
    return db
      .select({ invite: instanceInvites, creator: users })
      .from(instanceInvites)
      .leftJoin(users, eq(users.id, instanceInvites.createdBy))
      .orderBy(desc(instanceInvites.createdAt))
  },

  async find(code: string): Promise<{ invite: InstanceInviteRow; creator: UserRow | null } | null> {
    const [row] = await db
      .select({ invite: instanceInvites, creator: users })
      .from(instanceInvites)
      .leftJoin(users, eq(users.id, instanceInvites.createdBy))
      .where(eq(instanceInvites.code, code))
    return row ?? null
  },

  async delete(code: string): Promise<boolean> {
    const removed = await db
      .delete(instanceInvites)
      .where(eq(instanceInvites.code, code))
      .returning({ code: instanceInvites.code })
    return removed.length > 0
  },

  /** Takes one use if the invite is still valid; atomic, so it can't be overused. */
  async consume(code: string, now: Date): Promise<boolean> {
    const taken = await db
      .update(instanceInvites)
      .set({ uses: sql`${instanceInvites.uses} + 1` })
      .where(
        and(
          eq(instanceInvites.code, code),
          or(isNull(instanceInvites.maxUses), lt(instanceInvites.uses, instanceInvites.maxUses)),
          or(isNull(instanceInvites.expiresAt), gt(instanceInvites.expiresAt, now)),
        ),
      )
      .returning({ code: instanceInvites.code })
    return taken.length > 0
  },

  /** Gives back a use when the registration it was taken for failed. */
  async release(code: string): Promise<void> {
    await db
      .update(instanceInvites)
      .set({ uses: sql`greatest(${instanceInvites.uses} - 1, 0)` })
      .where(eq(instanceInvites.code, code))
  },
})

export type InstanceInviteRepository = ReturnType<typeof createInstanceInviteRepository>
