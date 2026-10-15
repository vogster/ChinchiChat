import { z } from 'zod'

import { snowflakeSchema } from '../snowflake/snowflake'
import { publicUserSchema } from '../users/user.schemas'
import { MESSAGE_MAX_LENGTH } from './message.schemas'

export const WEBHOOK_NAME_MAX_LENGTH = 80
/** Webhooks one channel may have. */
export const MAX_WEBHOOKS_PER_CHANNEL = 15

/** Names lose control and invisible formatting characters (direction overrides, zero-width). */
const webhookNameSchema = z
  .string()
  .max(WEBHOOK_NAME_MAX_LENGTH * 2)
  .transform((name) => name.replace(/[\p{Cc}\p{Cf}]/gu, '').trim())
  .pipe(z.string().min(1).max(WEBHOOK_NAME_MAX_LENGTH))

/** An incoming webhook: a secret URL that posts into one channel. */
export const webhookSchema = z.object({
  id: snowflakeSchema,
  guildId: snowflakeSchema,
  channelId: snowflakeSchema,
  name: z.string(),
  createdBy: publicUserSchema.nullable(),
  createdAt: z.iso.datetime(),
  /** Set when the webhook carries an announcement channel's published messages. */
  sourceChannelId: snowflakeSchema.nullable(),
})

/** Follows an announcement channel into one of the follower's text channels. */
export const followChannelRequestSchema = z.strictObject({ channelId: snowflakeSchema })

export const createWebhookRequestSchema = z.strictObject({ name: webhookNameSchema })

/** What a service sends to the webhook URL. */
export const executeWebhookRequestSchema = z.object({
  content: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH),
  /** Shown instead of the webhook's name for this message. */
  username: webhookNameSchema.optional(),
})

export type Webhook = z.infer<typeof webhookSchema>
export type ExecuteWebhookRequest = z.infer<typeof executeWebhookRequestSchema>
