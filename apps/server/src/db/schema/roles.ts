import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core'

import { snowflake } from '../columns'
import { channels, guildMembers, guilds } from './guilds'

/** The @everyone role of a server has the server's id. */
export const roles = pgTable(
  'roles',
  {
    id: snowflake('id').primaryKey(),
    guildId: snowflake('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    color: integer('color').notNull().default(0),
    position: integer('position').notNull().default(0),
    permissions: bigint('permissions', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    hoist: boolean('hoist').notNull().default(false),
    mentionable: boolean('mentionable').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('roles_guild_id_idx').on(table.guildId)],
)

export const memberRoles = pgTable(
  'member_roles',
  {
    guildId: snowflake('guild_id').notNull(),
    userId: snowflake('user_id').notNull(),
    roleId: snowflake('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.guildId, table.userId, table.roleId] }),
    // Leaving a server drops the member's roles with the membership.
    foreignKey({
      columns: [table.guildId, table.userId],
      foreignColumns: [guildMembers.guildId, guildMembers.userId],
    }).onDelete('cascade'),
  ],
)

export const overwriteTarget = pgEnum('overwrite_target', ['role', 'member'])

/** Per-channel allow/deny for a role or a member. */
export const channelOverwrites = pgTable(
  'channel_overwrites',
  {
    channelId: snowflake('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    targetType: overwriteTarget('target_type').notNull(),
    targetId: snowflake('target_id').notNull(),
    allow: bigint('allow', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    deny: bigint('deny', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
  },
  (table) => [primaryKey({ columns: [table.channelId, table.targetId] })],
)
