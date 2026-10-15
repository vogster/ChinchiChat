import { index, pgEnum, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core'

import { snowflake } from '../columns'
import { users } from './users'

export const emailTokenPurpose = pgEnum('email_token_purpose', ['verify_email', 'reset_password'])

/** One-time tokens delivered by email. Only the SHA-256 of the token is stored. */
export const emailTokens = pgTable(
  'email_tokens',
  {
    id: snowflake('id').primaryKey(),
    userId: snowflake('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: emailTokenPurpose('purpose').notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (table) => [index('email_tokens_user_id_idx').on(table.userId)],
)
