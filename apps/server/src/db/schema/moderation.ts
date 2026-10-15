import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'

import { snowflake } from '../columns'
import { guilds } from './guilds'
import { users } from './users'

/** Banned from a server: removed and kept out until unbanned. */
export const guildBans = pgTable(
  'guild_bans',
  {
    guildId: snowflake('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    userId: snowflake('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reason: varchar('reason', { length: 512 }),
    // Who banned; kept when that account goes, so the ban stays.
    bannedBy: snowflake('banned_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.userId] })],
)

export const auditLogAction = pgEnum('audit_log_action', [
  'member_kick',
  'member_ban',
  'member_unban',
  'member_timeout',
  'member_nickname',
  'member_role_add',
  'member_role_remove',
  'message_delete',
  'channel_create',
  'channel_update',
  'channel_delete',
  'role_create',
  'role_update',
  'role_delete',
  'guild_update',
  'automod_update',
  'automod_block',
  'webhook_create',
  'webhook_delete',
])

/** What moderators and admins did on a server, newest first by id. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: snowflake('id').primaryKey(),
    guildId: snowflake('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    action: auditLogAction('action').notNull(),
    actorId: snowflake('actor_id').references(() => users.id, { onDelete: 'set null' }),
    targetUserId: snowflake('target_user_id').references(() => users.id, { onDelete: 'set null' }),
    // A channel, role or message; not a foreign key, since the log outlives what it names.
    targetId: snowflake('target_id'),
    reason: text('reason'),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('audit_log_guild_id_id_idx').on(table.guildId, table.id)],
)

export const reportReason = pgEnum('report_reason', [
  'spam',
  'harassment',
  'nsfw',
  'illegal',
  'other',
])
export const reportStatus = pgEnum('report_status', ['open', 'resolved', 'dismissed'])

/**
 * Reports of messages. Server messages go to that server's moderators, direct messages
 * to the instance admins (guild_id is null). The message is copied in, so it can still
 * be judged after an edit or deletion; channel and message ids are kept without keys.
 */
export const messageReports = pgTable(
  'message_reports',
  {
    id: snowflake('id').primaryKey(),
    guildId: snowflake('guild_id').references(() => guilds.id, { onDelete: 'cascade' }),
    channelId: snowflake('channel_id').notNull(),
    messageId: snowflake('message_id').notNull(),
    authorId: snowflake('author_id').references(() => users.id, { onDelete: 'set null' }),
    content: text('content').notNull(),
    reporterId: snowflake('reporter_id').references(() => users.id, { onDelete: 'set null' }),
    reason: reportReason('reason').notNull(),
    details: varchar('details', { length: 500 }),
    status: reportStatus('status').notNull().default('open'),
    resolvedBy: snowflake('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('message_reports_message_reporter_idx').on(table.messageId, table.reporterId),
    index('message_reports_guild_status_idx').on(table.guildId, table.status, table.id),
  ],
)

/** A server's automod settings; no row means everything is off. */
export const guildAutomod = pgTable('guild_automod', {
  guildId: snowflake('guild_id')
    .primaryKey()
    .references(() => guilds.id, { onDelete: 'cascade' }),
  blockedWords: text('blocked_words').array().notNull().default([]),
  antiSpam: boolean('anti_spam').notNull().default(false),
  maxMentions: integer('max_mentions'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Timeouts of people who left while timed out: restored when they come back, so leaving and
 * rejoining doesn't lift a moderator's (or automod's) timeout.
 */
export const pendingTimeouts = pgTable(
  'pending_timeouts',
  {
    guildId: snowflake('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    userId: snowflake('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    until: timestamp('until', { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.userId] })],
)
