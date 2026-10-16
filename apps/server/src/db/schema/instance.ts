import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  smallint,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core'

import { snowflake } from '../columns'
import { users } from './users'

export const registrationMode = pgEnum('registration_mode', ['open', 'invite', 'closed'])

/** Settings admins change at runtime; a single row (id 1). Null columns fall back to env. */
export const instanceSettings = pgTable('instance_settings', {
  id: smallint('id').primaryKey().default(1),
  registrationMode: registrationMode('registration_mode'),
  maxGuildsPerUser: integer('max_guilds_per_user'),
  // Null falls back to REQUIRE_VERIFIED_EMAIL.
  requireVerifiedEmail: boolean('require_verified_email'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Codes that let someone register while registration is by invite. */
export const instanceInvites = pgTable('instance_invites', {
  code: varchar('code', { length: 32 }).primaryKey(),
  createdBy: snowflake('created_by').references(() => users.id, { onDelete: 'set null' }),
  uses: integer('uses').notNull().default(0),
  maxUses: integer('max_uses'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
