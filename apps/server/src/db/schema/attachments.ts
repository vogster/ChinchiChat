import { sql } from 'drizzle-orm'
import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

import { snowflake } from '../columns'
import { channels } from './guilds'
import { messages } from './messages'
import { users } from './users'

/** none: not an image (or too big to preview); pending → ready | failed by the preview worker. */
export type PreviewState = 'none' | 'pending' | 'ready' | 'failed'

/**
 * Files in object storage. A row is created when an upload is requested and stays pending
 * (no message) until a message claims it; unclaimed rows expire.
 */
export const attachments = pgTable(
  'attachments',
  {
    id: snowflake('id').primaryKey(),
    channelId: snowflake('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    uploaderId: snowflake('uploader_id').references(() => users.id, { onDelete: 'set null' }),
    messageId: snowflake('message_id').references(() => messages.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    // Images, once the preview worker has read them.
    width: integer('width'),
    height: integer('height'),
    previewState: text('preview_state').$type<PreviewState>().notNull().default('none'),
    previewAttempts: integer('preview_attempts').notNull().default(0),
    // Lease of the worker processing it; an expired lease means the worker died.
    previewLockedUntil: timestamp('preview_locked_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('attachments_message_id_idx').on(table.messageId),
    index('attachments_uploader_id_idx').on(table.uploaderId),
    index('attachments_preview_queue_idx')
      .on(table.id)
      .where(sql`${table.previewState} = 'pending' and ${table.messageId} is not null`),
  ],
)
