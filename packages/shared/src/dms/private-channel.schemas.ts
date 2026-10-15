import { z } from 'zod'

import { snowflakeSchema } from '../snowflake/snowflake'
import { publicUserSchema } from '../users/user.schemas'

/** A group DM holds at most this many people, its creator included. */
export const GROUP_DM_MAX_MEMBERS = 10

export const privateChannelTypeSchema = z.enum(['dm', 'group_dm'])

/** A direct message channel (1:1) or a group DM: channels without a server. */
export const privateChannelSchema = z.object({
  id: snowflakeSchema,
  type: privateChannelTypeSchema,
  /** Group DMs may be named; null shows the members' names. */
  name: z.string().nullable(),
  /** Who may remove people from a group DM; null for 1:1. */
  ownerId: snowflakeSchema.nullable(),
  /** Everyone in the channel except the viewer. */
  recipients: z.array(publicUserSchema),
  lastMessageId: snowflakeSchema.nullable(),
  /** An encrypted conversation (MLS): the server keeps only ciphertext. */
  encrypted: z.boolean(),
})

/** One recipient opens (or finds) the 1:1 DM; several start a group DM with your friends. */
export const createPrivateChannelRequestSchema = z.strictObject({
  recipientIds: z
    .array(snowflakeSchema)
    .min(1)
    .max(GROUP_DM_MAX_MEMBERS - 1)
    .refine((ids) => new Set(ids).size === ids.length, 'Duplicate recipient'),
  /** Opens the encrypted 1:1 conversation, started if missing (never the plain DM). */
  encrypted: z.boolean().optional(),
})

export const updatePrivateChannelRequestSchema = z.strictObject({
  name: z.string().trim().max(100).nullable(),
})

export type PrivateChannelType = z.infer<typeof privateChannelTypeSchema>
export type PrivateChannel = z.infer<typeof privateChannelSchema>
export type CreatePrivateChannelRequest = z.infer<typeof createPrivateChannelRequestSchema>
export type UpdatePrivateChannelRequest = z.infer<typeof updatePrivateChannelRequestSchema>
