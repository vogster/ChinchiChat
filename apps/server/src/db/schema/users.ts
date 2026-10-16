import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'

import { snowflake } from '../columns'

export const dmPolicy = pgEnum('dm_policy', ['servers', 'friends'])

export const users = pgTable(
  'users',
  {
    id: snowflake('id').primaryKey(),
    username: varchar('username', { length: 32 }).notNull(),
    displayName: varchar('display_name', { length: 32 }),
    // "About me", shown on the profile card.
    bio: varchar('bio', { length: 190 }),
    // Current avatar image (objects are keyed by it); null shows a placeholder.
    avatarId: snowflake('avatar_id'),
    // Profile banner (keyed like avatars) and accent colour (0xRRGGBB).
    bannerId: snowflake('banner_id'),
    accentColor: integer('accent_color'),
    email: varchar('email', { length: 254 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    // Who may send this user DMs (friends always can).
    dmPolicy: dmPolicy('dm_policy').notNull().default('servers'),
    // The language of emails (ru | en).
    locale: varchar('locale', { length: 8 }).notNull().default('ru'),
    // Authenticator (TOTP) secret: base32, or sealed under SECRETS_KEY (enc1:…); set means
    // sign-in asks for a code.
    totpSecret: text('totp_secret'),
    // A secret shown during setup, until a code from it confirms the app has it.
    totpPendingSecret: text('totp_pending_secret'),
    // Last accepted 30-second step: each code works once.
    totpLastStep: integer('totp_last_step'),
    // Instance admin: manages users, servers and registration.
    isAdmin: boolean('is_admin').notNull().default(false),
    // Suspended by an admin: can't sign in.
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    // Bot accounts: no password sign-in, a token instead; made by a person who owns them.
    isBot: boolean('is_bot').notNull().default(false),
    botOwnerId: snowflake('bot_owner_id').references((): AnyPgColumn => users.id, {
      onDelete: 'cascade',
    }),
    // Anyone may add a public bot to their server; a private one only its owner.
    botPublic: boolean('bot_public').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('users_username_lower_idx').on(sql`lower(${table.username})`),
    uniqueIndex('users_email_lower_idx').on(sql`lower(${table.email})`),
  ],
)

/** One-time codes for signing in without the authenticator app (hashed, like passwords). */
export const mfaRecoveryCodes = pgTable(
  'mfa_recovery_codes',
  {
    userId: snowflake('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: varchar('code_hash', { length: 64 }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.codeHash] })],
)
