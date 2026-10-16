import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core'

import { snowflake, snowflakeArray } from '../columns'
import { channels } from './guilds'
import { users } from './users'

import type { SystemMessageKind } from '@chinchi/shared'
import type { Embed } from '@chinchi/shared'

/** The creation time is encoded in the snowflake id, so there is no created_at column. */
export const messages = pgTable(
  'messages',
  {
    id: snowflake('id').primaryKey(),
    channelId: snowflake('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    // Messages outlive deleted accounts and are shown as from a deleted user.
    authorId: snowflake('author_id').references(() => users.id, { onDelete: 'set null' }),
    // Posted through an incoming webhook (no author): which one, under what name then.
    // Not a foreign key: the message stays when the webhook is deleted.
    webhookId: snowflake('webhook_id'),
    webhookName: varchar('webhook_name', { length: 80 }),
    // A bot's answer to a command: which one, and who ran it.
    interactionName: varchar('interaction_name', { length: 32 }),
    /** Group DM notes (joined, removed, left, renamed); the author is who did it. */
    system: jsonb('system').$type<{
      kind: SystemMessageKind
      targetId?: string | undefined
      name?: string | undefined
    }>(),
    interactionUserId: snowflake('interaction_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    content: text('content').notNull(),
    /** Encrypted conversations: the MLS message, base64 (content is empty). */
    ciphertext: text('ciphertext'),
    /** A forwarded message: the original as it was (content is the forwarder's comment). */
    forward: jsonb('forward').$type<{
      channelId: string
      guildId: string | null
      messageId: string
      authorId: string | null
      content: string
      createdAt: string
    }>(),
    // Not a foreign key: a reply keeps pointing at its original after that is deleted.
    replyToId: snowflake('reply_to_id'),
    replyMention: boolean('reply_mention').notNull().default(false),
    // Who the message notifies, after permission checks (see the mention resolver).
    mentionUserIds: snowflakeArray('mention_user_ids')
      .notNull()
      .default(sql`'{}'`),
    mentionRoleIds: snowflakeArray('mention_role_ids')
      .notNull()
      .default(sql`'{}'`),
    mentionEveryone: boolean('mention_everyone').notNull().default(false),
    mentionHere: boolean('mention_here').notNull().default(false),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    pinnedAt: timestamp('pinned_at', { withTimezone: true }),
    /** Announcement channels: when the message went out to the following channels. */
    publishedAt: timestamp('published_at', { withTimezone: true }),
    // Link previews, filled in later by the link preview queue.
    embeds: jsonb('embeds')
      .$type<Embed[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
  },
  (table) => [
    index('messages_channel_id_id_idx').on(table.channelId, table.id.desc()),
    index('messages_pinned_idx')
      .on(table.channelId, table.pinnedAt.desc())
      .where(sql`${table.pinnedAt} is not null`),
    // Mention counts only look at the few messages that mention anyone.
    index('messages_mentions_idx')
      .on(table.channelId, table.id)
      .where(
        sql`${table.mentionEveryone} or ${table.mentionHere} or cardinality(${table.mentionUserIds}) > 0 or cardinality(${table.mentionRoleIds}) > 0`,
      ),
  ],
)

/** How far each user has read in each channel. */
export const readStates = pgTable(
  'read_states',
  {
    userId: snowflake('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    channelId: snowflake('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    lastReadMessageId: snowflake('last_read_message_id').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.channelId] })],
)
