import { and, eq, inArray } from 'drizzle-orm'

import { channelOverwrites } from '../../db/schema'

import type { DbExecutor } from '../../db/client'
import type { Snowflake } from '@chinchi/shared'

export type OverwriteRow = typeof channelOverwrites.$inferSelect

export const createOverwriteRepository = (db: DbExecutor) => ({
  async listForChannels(channelIds: readonly Snowflake[]): Promise<Map<Snowflake, OverwriteRow[]>> {
    const byChannel = new Map<Snowflake, OverwriteRow[]>()
    if (channelIds.length === 0) return byChannel
    const rows = await db
      .select()
      .from(channelOverwrites)
      .where(inArray(channelOverwrites.channelId, [...channelIds]))
    for (const row of rows)
      byChannel.set(row.channelId, [...(byChannel.get(row.channelId) ?? []), row])
    return byChannel
  },

  async listForChannel(channelId: Snowflake): Promise<OverwriteRow[]> {
    return db.select().from(channelOverwrites).where(eq(channelOverwrites.channelId, channelId))
  },

  async upsert(row: OverwriteRow): Promise<void> {
    await db
      .insert(channelOverwrites)
      .values(row)
      .onConflictDoUpdate({
        target: [channelOverwrites.channelId, channelOverwrites.targetId],
        set: { targetType: row.targetType, allow: row.allow, deny: row.deny },
      })
  },

  /** Makes a channel's overwrites exactly these (a thread following its channel). */
  async replaceForChannel(channelId: Snowflake, rows: readonly OverwriteRow[]): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(channelOverwrites).where(eq(channelOverwrites.channelId, channelId))
      if (rows.length > 0) {
        await tx.insert(channelOverwrites).values(rows.map((row) => ({ ...row, channelId })))
      }
    })
  },

  async insertMany(rows: readonly OverwriteRow[]): Promise<void> {
    if (rows.length > 0)
      await db
        .insert(channelOverwrites)
        .values([...rows])
        .onConflictDoNothing()
  },

  async delete(channelId: Snowflake, targetId: Snowflake): Promise<boolean> {
    const deleted = await db
      .delete(channelOverwrites)
      .where(
        and(eq(channelOverwrites.channelId, channelId), eq(channelOverwrites.targetId, targetId)),
      )
      .returning({ channelId: channelOverwrites.channelId })
    return deleted.length > 0
  },

  /** A deleted role takes its overwrites with it; returns the channels that changed. */
  async deleteForTarget(targetId: Snowflake): Promise<Snowflake[]> {
    const deleted = await db
      .delete(channelOverwrites)
      .where(eq(channelOverwrites.targetId, targetId))
      .returning({ channelId: channelOverwrites.channelId })
    return deleted.map((row) => row.channelId)
  },
})

export type OverwriteRepository = ReturnType<typeof createOverwriteRepository>
