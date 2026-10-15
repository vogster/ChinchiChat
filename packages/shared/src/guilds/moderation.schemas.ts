import { z } from 'zod'

import { snowflakeSchema } from '../snowflake/snowflake'
import { publicUserSchema } from '../users/user.schemas'

/** Longest timeout, like Discord's. */
export const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000
/** Messages of a banned member from up to this long ago can be deleted with the ban. */
export const MAX_BAN_DELETE_SECONDS = 7 * 24 * 60 * 60

const reasonSchema = z.string().trim().max(512)

export const kickRequestSchema = z.strictObject({ reason: reasonSchema.optional() })

export const banRequestSchema = z.strictObject({
  reason: reasonSchema.optional(),
  deleteMessageSeconds: z.number().int().min(0).max(MAX_BAN_DELETE_SECONDS).default(0),
})

/** `until: null` lifts a timeout. Checked against the clock when the request arrives. */
export const timeoutRequestSchema = z.strictObject({
  until: z.iso
    .datetime()
    .nullable()
    .refine((until) => {
      if (until === null) return true
      const left = Date.parse(until) - Date.now()
      return left > 0 && left <= MAX_TIMEOUT_MS
    }, 'A timeout ends in the future, at most 28 days from now'),
  reason: reasonSchema.optional(),
})

export const banSchema = z.object({
  user: publicUserSchema,
  reason: z.string().nullable(),
  createdAt: z.iso.datetime(),
})

export const auditLogActionSchema = z.enum([
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
  /** Automod refused a message (the actor is the author). */
  'automod_block',
  'webhook_create',
  'webhook_delete',
])

/** One moderation or settings change on a server, with who did it and to whom or what. */
export const auditLogEntrySchema = z.object({
  id: snowflakeSchema,
  action: auditLogActionSchema,
  actor: publicUserSchema.nullable(),
  /** The member acted on, for member actions. */
  targetUser: publicUserSchema.nullable(),
  /** The channel, role or message acted on, for those actions. */
  targetId: snowflakeSchema.nullable(),
  reason: z.string().nullable(),
  /** Action details, e.g. `{ until }` for a timeout or `{ name }` for a channel. */
  data: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
})

export const auditLogQuerySchema = z.object({
  before: snowflakeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export type KickRequest = z.infer<typeof kickRequestSchema>
export type BanRequest = z.input<typeof banRequestSchema>
export type TimeoutRequest = z.infer<typeof timeoutRequestSchema>
export type Ban = z.infer<typeof banSchema>
export type AuditLogAction = z.infer<typeof auditLogActionSchema>
export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>
export type AuditLogQuery = z.input<typeof auditLogQuerySchema>
