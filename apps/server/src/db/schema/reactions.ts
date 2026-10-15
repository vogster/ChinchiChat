import { index, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'

import { snowflake } from '../columns'
import { messages } from './messages'
import { users } from './users'

/** One user's emoji on one message; a message's reactions are ordered by first use. */
export const messageReactions = pgTable(
  'message_reactions',
  {
    messageId: snowflake('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userId: snowflake('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.userId, table.emoji] }),
    index('message_reactions_message_id_created_at_idx').on(table.messageId, table.createdAt),
  ],
)
