import { index, jsonb, pgTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core'

import { snowflake } from '../columns'
import { channels, guilds } from './guilds'
import { users } from './users'

export interface CommandOption {
  readonly name: string
  readonly description: string
  readonly required: boolean
}

/** A bot's slash commands; they work on every server the bot is a member of. */
export const botCommands = pgTable(
  'bot_commands',
  {
    id: snowflake('id').primaryKey(),
    botId: snowflake('bot_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 32 }).notNull(),
    description: varchar('description', { length: 100 }).notNull(),
    options: jsonb('options').$type<CommandOption[]>().notNull(),
  },
  (table) => [uniqueIndex('bot_commands_bot_name_idx').on(table.botId, table.name)],
)

/** A command someone ran, waiting (15 minutes) for the bot's one answer. */
export const interactions = pgTable(
  'interactions',
  {
    id: snowflake('id').primaryKey(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    botId: snowflake('bot_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    commandName: varchar('command_name', { length: 32 }).notNull(),
    guildId: snowflake('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    channelId: snowflake('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    userId: snowflake('user_id').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
  },
  (table) => [index('interactions_expires_idx').on(table.expiresAt)],
)
