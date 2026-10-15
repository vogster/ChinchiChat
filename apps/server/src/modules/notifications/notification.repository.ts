import { and, eq } from 'drizzle-orm'

import { notificationSettings } from '../../db/schema'

import type { DbExecutor } from '../../db/client'
import type { NotificationSetting, Snowflake } from '@chinchi/shared'

type Row = typeof notificationSettings.$inferSelect

const toSetting = (row: Row): NotificationSetting => ({
  targetId: row.targetId,
  level: row.level,
  muted: row.muted,
  mutedUntil: row.mutedUntil?.toISOString() ?? null,
})

const byTarget = (userId: Snowflake, targetId: Snowflake) =>
  and(eq(notificationSettings.userId, userId), eq(notificationSettings.targetId, targetId))

export const createNotificationRepository = (db: DbExecutor) => ({
  async listForUser(userId: Snowflake): Promise<NotificationSetting[]> {
    const rows = await db
      .select()
      .from(notificationSettings)
      .where(eq(notificationSettings.userId, userId))
    return rows.map(toSetting)
  },

  async find(userId: Snowflake, targetId: Snowflake): Promise<NotificationSetting | null> {
    const [row] = await db.select().from(notificationSettings).where(byTarget(userId, targetId))
    return row ? toSetting(row) : null
  },

  async save(userId: Snowflake, setting: NotificationSetting): Promise<void> {
    const values = {
      level: setting.level,
      muted: setting.muted,
      mutedUntil: setting.mutedUntil ? new Date(setting.mutedUntil) : null,
      updatedAt: new Date(),
    }
    await db
      .insert(notificationSettings)
      .values({ userId, targetId: setting.targetId, ...values })
      .onConflictDoUpdate({
        target: [notificationSettings.userId, notificationSettings.targetId],
        set: values,
      })
  },

  async remove(userId: Snowflake, targetId: Snowflake): Promise<void> {
    await db.delete(notificationSettings).where(byTarget(userId, targetId))
  },
})

export type NotificationRepository = ReturnType<typeof createNotificationRepository>
