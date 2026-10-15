import { index, pgEnum, pgTable, primaryKey, timestamp } from 'drizzle-orm/pg-core'

import { snowflake } from '../columns'
import { users } from './users'

export const relationshipType = pgEnum('relationship_type', [
  'friend',
  'pending_out',
  'pending_in',
  'blocked',
])

/** How `user_id` relates to `target_id`; friends and requests have a row on each side. */
export const relationships = pgTable(
  'relationships',
  {
    userId: snowflake('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetId: snowflake('target_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: relationshipType('type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.targetId] }),
    index('relationships_target_id_idx').on(table.targetId),
  ],
)
