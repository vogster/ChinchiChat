import {
  bigint,
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'

import { snowflake } from '../columns'
import { channels } from './guilds'
import { users } from './users'

/** A device taking part in encrypted conversations; its signature key is its MLS identity. */
export const e2eeDevices = pgTable(
  'e2ee_devices',
  {
    id: snowflake('id').primaryKey(),
    userId: snowflake('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 64 }).notNull(),
    /** Ed25519 public key, base64. */
    signaturePublicKey: varchar('signature_public_key', { length: 44 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Removed: kept so members still recognise its leaves, but never added again. */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    /** The owner's user key vouching for the device, base64; cleared when that key changes. */
    userSignature: varchar('user_signature', { length: 88 }),
  },
  (table) => [
    index('e2ee_devices_user_id_idx').on(table.userId),
    uniqueIndex('e2ee_devices_signature_key_idx').on(table.signaturePublicKey),
  ],
)

/** A user's own key (cross-signing): signs the user's devices. One per user, replaced on reset. */
export const e2eeUserKeys = pgTable('e2ee_user_keys', {
  userId: snowflake('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** Ed25519 public key, base64. */
  publicKey: varchar('public_key', { length: 44 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/** One-time MLS key packages; a claimed one is deleted, except the device's last resort. */
export const e2eeKeyPackages = pgTable(
  'e2ee_key_packages',
  {
    id: snowflake('id').primaryKey(),
    deviceId: snowflake('device_id')
      .notNull()
      .references(() => e2eeDevices.id, { onDelete: 'cascade' }),
    package: text('package').notNull(),
    lastResort: boolean('last_resort').notNull().default(false),
  },
  (table) => [index('e2ee_key_packages_device_id_idx').on(table.deviceId, table.lastResort)],
)

/** The current MLS epoch of an encrypted conversation: commits are taken only for it. */
export const e2eeGroups = pgTable('e2ee_groups', {
  channelId: snowflake('channel_id')
    .primaryKey()
    .references(() => channels.id, { onDelete: 'cascade' }),
  epoch: bigint('epoch', { mode: 'number' }).notNull().default(0),
})

export const e2eeHandshakeKind = pgEnum('e2ee_handshake_kind', ['commit', 'welcome'])

/** Commits and Welcomes, in the order the server took them. Opaque to the server. */
export const e2eeHandshakes = pgTable(
  'e2ee_handshakes',
  {
    id: snowflake('id').primaryKey(),
    channelId: snowflake('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    kind: e2eeHandshakeKind('kind').notNull(),
    epoch: bigint('epoch', { mode: 'number' }).notNull(),
    // Not foreign keys: the history stays readable after a device is removed.
    senderDeviceId: snowflake('sender_device_id').notNull(),
    targetDeviceId: snowflake('target_device_id'),
    keyPackageId: snowflake('key_package_id'),
    payload: text('payload').notNull(),
  },
  (table) => [index('e2ee_handshakes_channel_id_idx').on(table.channelId, table.id)],
)
