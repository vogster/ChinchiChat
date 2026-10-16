import { and, asc, count, eq, gt, isNull, or, sql } from 'drizzle-orm'

import {
  channelRecipients,
  channels,
  e2eeDevices,
  e2eeGroups,
  e2eeHandshakes,
  e2eeKeyPackages,
  e2eeUserKeys,
} from '../../db/schema'

import type { DbExecutor } from '../../db/client'
import type { Snowflake } from '@chinchi/shared'

export type DeviceRow = typeof e2eeDevices.$inferSelect
export type HandshakeRow = typeof e2eeHandshakes.$inferSelect
export type UserKeyRow = typeof e2eeUserKeys.$inferSelect

const HANDSHAKE_PAGE = 500

export const createE2eeRepository = (db: DbExecutor) => ({
  /** Whether two people are in some DM or group DM together. */
  async sharePrivateChannel(a: Snowflake, b: Snowflake): Promise<boolean> {
    const rows = await db.execute<{ found: number }>(sql`
      select 1 as found from ${channelRecipients} x
      join ${channelRecipients} y on y.channel_id = x.channel_id
      where x.user_id = ${a} and y.user_id = ${b}
      limit 1`)
    return rows.length > 0
  },

  /** Everyone in an encrypted conversation with the user (they follow the user's devices). */
  async peerIds(userId: Snowflake): Promise<Snowflake[]> {
    const rows = await db.execute<{ user_id: string }>(sql`
      select distinct y.user_id::text as user_id
      from ${channelRecipients} x
      join ${channels} c on c.id = x.channel_id and c.encrypted
      join ${channelRecipients} y on y.channel_id = x.channel_id
      where x.user_id = ${userId} and y.user_id <> ${userId}`)
    return rows.map((row) => row.user_id)
  },

  listDevices: (userId: Snowflake): Promise<DeviceRow[]> =>
    db
      .select()
      .from(e2eeDevices)
      .where(eq(e2eeDevices.userId, userId))
      .orderBy(asc(e2eeDevices.id)),

  async findDevice(id: Snowflake): Promise<DeviceRow | null> {
    const [row] = await db.select().from(e2eeDevices).where(eq(e2eeDevices.id, id))
    return row ?? null
  },

  async findDeviceByKey(signaturePublicKey: string): Promise<DeviceRow | null> {
    const [row] = await db
      .select()
      .from(e2eeDevices)
      .where(eq(e2eeDevices.signaturePublicKey, signaturePublicKey))
    return row ?? null
  },

  async findUserKey(userId: Snowflake): Promise<UserKeyRow | null> {
    const [row] = await db.select().from(e2eeUserKeys).where(eq(e2eeUserKeys.userId, userId))
    return row ?? null
  },

  /** Null when the user already has a key. */
  async insertUserKey(userId: Snowflake, publicKey: string): Promise<UserKeyRow | null> {
    const [row] = await db
      .insert(e2eeUserKeys)
      .values({ userId, publicKey })
      .onConflictDoNothing({ target: e2eeUserKeys.userId })
      .returning()
    return row ?? null
  },

  /** A new key after a reset: the old one's signatures vouch for nothing any more. */
  async replaceUserKey(userId: Snowflake, publicKey: string): Promise<UserKeyRow> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(e2eeUserKeys)
        .values({ userId, publicKey })
        .onConflictDoUpdate({
          target: e2eeUserKeys.userId,
          set: { publicKey, createdAt: new Date() },
        })
        .returning()
      await tx
        .update(e2eeDevices)
        .set({ userSignature: null })
        .where(eq(e2eeDevices.userId, userId))
      return row as UserKeyRow
    })
  },

  async setDeviceSignature(deviceId: Snowflake, userSignature: string): Promise<void> {
    await db.update(e2eeDevices).set({ userSignature }).where(eq(e2eeDevices.id, deviceId))
  },

  /** Null when the key is already registered (to anyone). */
  async insertDevice(
    row: Omit<DeviceRow, 'createdAt' | 'revokedAt' | 'userSignature'>,
  ): Promise<DeviceRow | null> {
    const [inserted] = await db
      .insert(e2eeDevices)
      .values(row)
      .onConflictDoNothing({ target: e2eeDevices.signaturePublicKey })
      .returning()
    return inserted ?? null
  },

  /** Revokes the device (it stays listed) and drops its key packages. */
  async revokeDevice(id: Snowflake, userId: Snowflake): Promise<boolean> {
    return db.transaction(async (tx) => {
      const revoked = await tx
        .update(e2eeDevices)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(e2eeDevices.id, id),
            eq(e2eeDevices.userId, userId),
            isNull(e2eeDevices.revokedAt),
          ),
        )
        .returning({ id: e2eeDevices.id })
      if (revoked.length === 0) return false
      await tx.delete(e2eeKeyPackages).where(eq(e2eeKeyPackages.deviceId, id))
      return true
    })
  },

  /** One-time packages waiting on the server (the last resort is not counted). */
  async countKeyPackages(deviceId: Snowflake): Promise<number> {
    const [row] = await db
      .select({ value: count() })
      .from(e2eeKeyPackages)
      .where(and(eq(e2eeKeyPackages.deviceId, deviceId), eq(e2eeKeyPackages.lastResort, false)))
    return row?.value ?? 0
  },

  async addKeyPackages(
    deviceId: Snowflake,
    packages: readonly { id: Snowflake; package: string }[],
    lastResort?: { id: Snowflake; package: string },
  ): Promise<void> {
    await db.transaction(async (tx) => {
      if (packages.length > 0) {
        await tx.insert(e2eeKeyPackages).values(packages.map((p) => ({ ...p, deviceId })))
      }
      if (lastResort) {
        await tx
          .delete(e2eeKeyPackages)
          .where(and(eq(e2eeKeyPackages.deviceId, deviceId), eq(e2eeKeyPackages.lastResort, true)))
        await tx.insert(e2eeKeyPackages).values({ ...lastResort, deviceId, lastResort: true })
      }
    })
  },

  /**
   * Hands out one package of the device: a one-time one (deleted, skipping rows another claim
   * holds), else the last resort, which stays.
   */
  async claimKeyPackage(deviceId: Snowflake): Promise<{ id: Snowflake; package: string } | null> {
    return db.transaction(async (tx) => {
      const [oneTime] = await tx
        .select({ id: e2eeKeyPackages.id, package: e2eeKeyPackages.package })
        .from(e2eeKeyPackages)
        .where(and(eq(e2eeKeyPackages.deviceId, deviceId), eq(e2eeKeyPackages.lastResort, false)))
        .orderBy(asc(e2eeKeyPackages.id))
        .limit(1)
        .for('update', { skipLocked: true })
      if (oneTime) {
        await tx.delete(e2eeKeyPackages).where(eq(e2eeKeyPackages.id, oneTime.id))
        return oneTime
      }
      const [last] = await tx
        .select({ id: e2eeKeyPackages.id, package: e2eeKeyPackages.package })
        .from(e2eeKeyPackages)
        .where(and(eq(e2eeKeyPackages.deviceId, deviceId), eq(e2eeKeyPackages.lastResort, true)))
      return last ?? null
    })
  },

  /**
   * Takes a commit (and its Welcomes) only if `epoch` is still the conversation's current one,
   * under the group row's lock, then moves to the next epoch. 'stale' when another won.
   */
  async commit(
    channelId: Snowflake,
    epoch: number,
    rows: readonly Omit<HandshakeRow, 'channelId' | 'epoch'>[],
  ): Promise<HandshakeRow[] | 'stale'> {
    return db.transaction(async (tx) => {
      await tx.insert(e2eeGroups).values({ channelId }).onConflictDoNothing()
      const [group] = await tx
        .select({ epoch: e2eeGroups.epoch })
        .from(e2eeGroups)
        .where(eq(e2eeGroups.channelId, channelId))
        .for('update')
      if (!group || group.epoch !== epoch) return 'stale'
      const inserted = await tx
        .insert(e2eeHandshakes)
        .values(rows.map((row) => ({ ...row, channelId, epoch })))
        .returning()
      await tx
        .update(e2eeGroups)
        .set({ epoch: sql`${e2eeGroups.epoch} + 1` })
        .where(eq(e2eeGroups.channelId, channelId))
      return inserted
    })
  },

  /** Every commit, plus the Welcomes for this device, in order. */
  listHandshakes: (
    channelId: Snowflake,
    deviceId: Snowflake,
    after: Snowflake | undefined,
  ): Promise<HandshakeRow[]> =>
    db
      .select()
      .from(e2eeHandshakes)
      .where(
        and(
          eq(e2eeHandshakes.channelId, channelId),
          after ? gt(e2eeHandshakes.id, after) : undefined,
          or(isNull(e2eeHandshakes.targetDeviceId), eq(e2eeHandshakes.targetDeviceId, deviceId)),
        ),
      )
      .orderBy(asc(e2eeHandshakes.id))
      .limit(HANDSHAKE_PAGE),
})

export type E2eeRepository = ReturnType<typeof createE2eeRepository>
