import { z } from 'zod'

import { snowflakeSchema } from '../snowflake/snowflake'

/** Binary payloads travel as standard base64; the limit is on the encoded length. */
export const base64Schema = (maxLength: number) =>
  z
    .string()
    .min(1)
    .max(maxLength)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Not base64')

/** A one-time MLS key package (a few hundred bytes in practice). */
export const KEY_PACKAGE_MAX_BASE64 = 8 * 1024
/** Key packages a device may hold on the server at once. */
export const KEY_PACKAGES_MAX_PER_DEVICE = 100
/** Devices one user may register (each is a member of every encrypted conversation). */
export const DEVICES_MAX_PER_USER = 10
/** An encrypted message: text, file keys and metadata, before base64. */
export const CIPHERTEXT_MAX_BASE64 = 96 * 1024
/** Commits and Welcomes grow with the group (group DMs hold at most 10 people). */
export const HANDSHAKE_MAX_BASE64 = 512 * 1024

/** A device that takes part in encrypted conversations; its signature key is its identity. */
export const deviceSchema = z.object({
  id: snowflakeSchema,
  userId: snowflakeSchema,
  name: z.string(),
  /** Ed25519 public key, base64. */
  signaturePublicKey: z.string(),
  createdAt: z.iso.datetime(),
  /**
   * Set once the device is removed. It stays listed so members can still recognise it in
   * conversation history, but it is never added again and its key packages are gone.
   */
  revokedAt: z.iso.datetime().nullable(),
})

export const registerDeviceRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(64),
  /** 32 bytes of Ed25519 public key. */
  signaturePublicKey: base64Schema(44).refine((key) => key.length === 44, 'Expected 32 bytes'),
})

export const uploadKeyPackagesRequestSchema = z.strictObject({
  packages: z.array(base64Schema(KEY_PACKAGE_MAX_BASE64)).max(KEY_PACKAGES_MAX_PER_DEVICE),
  /** Handed out when the others run out, and kept (MLS "last resort" package). */
  lastResort: base64Schema(KEY_PACKAGE_MAX_BASE64).optional(),
})

/** One key package per device of a user, as handed out to whoever adds them. */
export const claimedKeyPackageSchema = z.object({
  deviceId: snowflakeSchema,
  keyPackageId: snowflakeSchema,
  package: z.string(),
})

export const handshakeKindSchema = z.enum(['commit', 'welcome'])

/** A commit (for every member) or a Welcome (for one new device), in the order the server took them. */
export const handshakeSchema = z.object({
  id: snowflakeSchema,
  channelId: snowflakeSchema,
  kind: handshakeKindSchema,
  /** The epoch the commit was made from; a Welcome joins at epoch + 1. */
  epoch: z.number().int().nonnegative(),
  senderDeviceId: snowflakeSchema,
  /** Welcomes: the device it is for; null for commits. */
  targetDeviceId: snowflakeSchema.nullable(),
  /** Welcomes: the key package of the target it was made with. */
  keyPackageId: snowflakeSchema.nullable(),
  payload: z.string(),
})

export const postCommitRequestSchema = z
  .strictObject({
    deviceId: snowflakeSchema,
    /** The epoch the commit was made from: the server takes it only if that is still current. */
    epoch: z.number().int().nonnegative(),
    commit: base64Schema(HANDSHAKE_MAX_BASE64),
    welcome: base64Schema(HANDSHAKE_MAX_BASE64).optional(),
    /** Who the Welcome is for, with the key packages it used. */
    welcomeTargets: z
      .array(z.strictObject({ deviceId: snowflakeSchema, keyPackageId: snowflakeSchema }))
      .max(100)
      .optional(),
  })
  .refine(
    (body) => (body.welcome === undefined) === (body.welcomeTargets === undefined),
    'A Welcome needs its targets, and targets need a Welcome',
  )

export const listHandshakesQuerySchema = z.object({
  deviceId: snowflakeSchema,
  /** Only handshakes after this one. */
  after: snowflakeSchema.optional(),
})

export type Device = z.infer<typeof deviceSchema>
export type RegisterDeviceRequest = z.infer<typeof registerDeviceRequestSchema>
export type UploadKeyPackagesRequest = z.infer<typeof uploadKeyPackagesRequestSchema>
export type ClaimedKeyPackage = z.infer<typeof claimedKeyPackageSchema>
export type Handshake = z.infer<typeof handshakeSchema>
export type PostCommitRequest = z.infer<typeof postCommitRequestSchema>
export type ListHandshakesQuery = z.infer<typeof listHandshakesQuerySchema>
