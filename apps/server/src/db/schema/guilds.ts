import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core'

import { snowflake } from '../columns'
import { users } from './users'

import type { AnyPgColumn } from 'drizzle-orm/pg-core'

export const guilds = pgTable('guilds', {
  id: snowflake('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  // Current icon image (objects are keyed by it); null shows initials.
  iconId: snowflake('icon_id'),
  // Restrict: an account that owns servers must transfer or delete them first.
  ownerId: snowflake('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  // Rules newcomers accept before they may talk; null when the server has none.
  rules: text('rules'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const channelType = pgEnum('channel_type', [
  'text',
  'voice',
  'category',
  // Direct messages: channels without a server (guild_id is null).
  'dm',
  'group_dm',
  // A thread inside a text channel (parent_id); it copies the channel's permissions.
  'thread',
])

export const channels = pgTable(
  'channels',
  {
    id: snowflake('id').primaryKey(),
    // Null for direct messages (dm, group_dm).
    guildId: snowflake('guild_id').references(() => guilds.id, { onDelete: 'cascade' }),
    type: channelType('type').notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    topic: text('topic'),
    /** Category this channel sits in; deleting the category moves children to the top level. */
    parentId: snowflake('parent_id').references((): AnyPgColumn => channels.id, {
      onDelete: 'set null',
    }),
    position: integer('position').notNull().default(0),
    /** Slowmode: seconds between one member's messages (text channels); 0 is off. */
    rateLimitPerUser: integer('rate_limit_per_user').notNull().default(0),
    nsfw: boolean('nsfw').notNull().default(false),
    /** Text channels whose messages can be published to the channels following them. */
    announcement: boolean('announcement').notNull().default(false),
    /** Newest message id; lets clients show unread state without loading history. */
    lastMessageId: snowflake('last_message_id'),
    /** Group DMs: who may remove members. */
    ownerId: snowflake('owner_id').references(() => users.id, { onDelete: 'set null' }),
    /** Threads: the message they answer (one thread per message). */
    threadStarterId: snowflake('thread_starter_id').unique(),
    /** Threads: how many messages they hold, shown next to the starter message. */
    messageCount: integer('message_count').notNull().default(0),
    /** DMs and group DMs: an encrypted conversation (MLS); messages hold only ciphertext. */
    encrypted: boolean('encrypted').notNull().default(false),
    /** 1:1 DMs: the two user ids, lower first, so a pair has exactly one channel. */
    dmKey: varchar('dm_key', { length: 41 }).unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('channels_guild_id_idx').on(table.guildId)],
)

export const guildMembers = pgTable(
  'guild_members',
  {
    guildId: snowflake('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    userId: snowflake('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    nickname: varchar('nickname', { length: 32 }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    // Server mute and deafen: kept on the member so rejoining voice doesn't lift them.
    voiceMute: boolean('voice_mute').notNull().default(false),
    voiceDeaf: boolean('voice_deaf').notNull().default(false),
    // A moderator's timeout: until then the member may only look and read.
    timeoutUntil: timestamp('timeout_until', { withTimezone: true }),
    // Joined while the server had rules and has not accepted them yet: may only read.
    pending: boolean('pending').notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.guildId, table.userId] }),
    index('guild_members_user_id_idx').on(table.userId),
  ],
)

export const invites = pgTable(
  'invites',
  {
    code: varchar('code', { length: 16 }).primaryKey(),
    guildId: snowflake('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    channelId: snowflake('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    inviterId: snowflake('inviter_id').references(() => users.id, { onDelete: 'set null' }),
    uses: integer('uses').notNull().default(0),
    /** null: unlimited. */
    maxUses: integer('max_uses'),
    /** null: never expires. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('invites_guild_id_idx').on(table.guildId)],
)

/** Who is in a direct message channel. */
export const channelRecipients = pgTable(
  'channel_recipients',
  {
    channelId: snowflake('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    userId: snowflake('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.channelId, table.userId] }),
    index('channel_recipients_user_id_idx').on(table.userId),
  ],
)
