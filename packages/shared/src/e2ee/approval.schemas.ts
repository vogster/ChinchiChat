import { z } from 'zod'

import { snowflakeSchema } from '../snowflake/snowflake'
import { base64Schema } from './e2ee.schemas'

/** How long a device approval may take before it is forgotten. */
export const APPROVAL_SECONDS = 10 * 60

/** 32 bytes, base64: an X25519 public key or a SHA-256 commitment. */
const bytes32 = base64Schema(44).refine((value) => value.length === 44, 'Expected 32 bytes')

export const approvalStateSchema = z.enum([
  'requested',
  'accepted',
  'revealed',
  'completed',
  'declined',
])

/**
 * A new device asking one of the user's approved devices to vouch for it. The server only
 * relays: the new device commits to its key first, so the six emoji both screens show can't be
 * steered by whoever passes the keys along.
 */
export const deviceApprovalSchema = z.object({
  id: snowflakeSchema,
  newDeviceId: snowflakeSchema,
  /** SHA-256 of the new device's ephemeral X25519 key, sent before it sees the approver's. */
  commitment: z.string(),
  newKey: z.string().nullable(),
  approverDeviceId: snowflakeSchema.nullable(),
  approverKey: z.string().nullable(),
  /** The user key and recovery key, encrypted with the secret both devices agreed on. */
  secrets: z.string().nullable(),
  state: approvalStateSchema,
  expiresAt: z.iso.datetime(),
})

export const createApprovalRequestSchema = z.strictObject({
  deviceId: snowflakeSchema,
  commitment: bytes32,
})

export const acceptApprovalRequestSchema = z.strictObject({
  deviceId: snowflakeSchema,
  publicKey: bytes32,
})

export const revealApprovalRequestSchema = z.strictObject({ publicKey: bytes32 })

export const completeApprovalRequestSchema = z.strictObject({ secrets: base64Schema(4096) })

export type DeviceApproval = z.infer<typeof deviceApprovalSchema>
export type ApprovalState = z.infer<typeof approvalStateSchema>
