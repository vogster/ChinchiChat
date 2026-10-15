import { z } from 'zod'

import { snowflakeSchema } from '../snowflake/snowflake'

/** Where a user is in voice and how; `channelId: null` means they left. */
export const voiceStateSchema = z.object({
  /** null for calls in DMs. */
  guildId: snowflakeSchema.nullable(),
  channelId: snowflakeSchema.nullable(),
  userId: snowflakeSchema,
  selfMute: z.boolean(),
  selfDeaf: z.boolean(),
  /** Set by a moderator; survives leaving and rejoining. */
  serverMute: z.boolean(),
  serverDeaf: z.boolean(),
  /** Camera on. */
  video: z.boolean(),
  /** Sharing the screen. */
  stream: z.boolean(),
})

/** How to connect: the LiveKit address and a short-lived token for the room. */
export const voiceConnectionSchema = z.object({
  url: z.string(),
  token: z.string(),
})

export const joinVoiceRequestSchema = z.strictObject({
  selfMute: z.boolean().default(false),
  selfDeaf: z.boolean().default(false),
})

const notEmpty = (body: object) => Object.keys(body).length > 0

/** The user's own mute and deafen. */
export const updateVoiceStateRequestSchema = z
  .strictObject({ selfMute: z.boolean().optional(), selfDeaf: z.boolean().optional() })
  .refine(notEmpty, 'Nothing to update')

/** A moderator's change to someone else: server mute, server deafen or disconnect. */
export const memberVoiceRequestSchema = z
  .strictObject({
    mute: z.boolean().optional(),
    deaf: z.boolean().optional(),
    disconnect: z.literal(true).optional(),
  })
  .refine(notEmpty, 'Nothing to update')

export type VoiceState = z.infer<typeof voiceStateSchema>
export type VoiceConnection = z.infer<typeof voiceConnectionSchema>
export type JoinVoiceRequest = z.input<typeof joinVoiceRequestSchema>
export type UpdateVoiceStateRequest = z.infer<typeof updateVoiceStateRequestSchema>
export type MemberVoiceRequest = z.infer<typeof memberVoiceRequestSchema>
