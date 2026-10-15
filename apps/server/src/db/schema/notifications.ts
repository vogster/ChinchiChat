import { boolean, pgEnum, pgTable, primaryKey, timestamp } from 'drizzle-orm/pg-core'

import { snowflake } from '../columns'
import { users } from './users'

export const notificationLevel = pgEnum('notification_level', ['all', 'mentions', 'none'])

/**
 * A user's notification settings for a server, a channel or a DM (`target_id`, no foreign key:
 * it is one of three tables). Rows exist only while something differs from the defaults.
 */
export const notificationSettings = pgTable(
  'notification_settings',
  {
    userId: snowflake('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetId: snowflake('target_id').notNull(),
    /** Null inherits from the parent (channel → category → server). */
    level: notificationLevel('level'),
    muted: boolean('muted').notNull().default(false),
    mutedUntil: timestamp('muted_until', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.targetId] })],
)
