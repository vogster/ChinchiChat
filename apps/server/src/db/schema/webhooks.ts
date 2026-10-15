import { index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core'

import { snowflake } from '../columns'
import { channels, guilds } from './guilds'
import { users } from './users'

/** Incoming webhooks: whoever holds the secret URL may post into the channel. */
export const webhooks = pgTable(
  'webhooks',
  {
    id: snowflake('id').primaryKey(),
    guildId: snowflake('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    channelId: snowflake('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    // SHA-256 of the token: a leaked table can't be used to post.
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    createdBy: snowflake('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Follower webhooks: the announcement channel whose published messages they carry. */
    sourceChannelId: snowflake('source_channel_id').references(() => channels.id, {
      onDelete: 'cascade',
    }),
  },
  (table) => [
    index('webhooks_channel_idx').on(table.channelId),
    index('webhooks_source_channel_idx').on(table.sourceChannelId),
  ],
)
