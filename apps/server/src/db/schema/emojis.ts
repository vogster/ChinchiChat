import { sql } from 'drizzle-orm'
import { boolean, index, pgTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core'

import { snowflake } from '../columns'
import { guilds } from './guilds'
import { users } from './users'

/** A server's own emoji; the image lives in storage under `emojis/<guildId>/<id>.webp`. */
export const guildEmojis = pgTable(
  'guild_emojis',
  {
    id: snowflake('id').primaryKey(),
    guildId: snowflake('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 32 }).notNull(),
    /** Stored as animated WebP. */
    animated: boolean('animated').notNull().default(false),
    createdBy: snowflake('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // `:Cat:` and `:cat:` would be the same thing to type.
    uniqueIndex('guild_emojis_guild_name_idx').on(table.guildId, sql`lower(${table.name})`),
    index('guild_emojis_guild_idx').on(table.guildId),
  ],
)
