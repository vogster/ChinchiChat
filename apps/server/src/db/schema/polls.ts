import { boolean, pgTable, primaryKey, smallint, text, timestamp } from 'drizzle-orm/pg-core'

import { snowflake } from '../columns'
import { messages } from './messages'
import { users } from './users'

/** A poll sent with a message; it lives and dies with it. */
export const polls = pgTable('polls', {
  messageId: snowflake('message_id')
    .primaryKey()
    .references(() => messages.id, { onDelete: 'cascade' }),
  question: text('question').notNull(),
  multiple: boolean('multiple').notNull().default(false),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  /** Set when the author ended it before it expired. */
  endedAt: timestamp('ended_at', { withTimezone: true }),
})

/** A poll's answers, numbered from 1 in the order they were written. */
export const pollAnswers = pgTable(
  'poll_answers',
  {
    messageId: snowflake('message_id')
      .notNull()
      .references(() => polls.messageId, { onDelete: 'cascade' }),
    answerId: smallint('answer_id').notNull(),
    text: text('text').notNull(),
  },
  (table) => [primaryKey({ columns: [table.messageId, table.answerId] })],
)

/** One person's vote for one answer (several rows where several answers are allowed). */
export const pollVotes = pgTable(
  'poll_votes',
  {
    messageId: snowflake('message_id')
      .notNull()
      .references(() => polls.messageId, { onDelete: 'cascade' }),
    answerId: smallint('answer_id').notNull(),
    userId: snowflake('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.messageId, table.userId, table.answerId] })],
)
