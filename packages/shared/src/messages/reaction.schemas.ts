import { z } from 'zod'

import { snowflakeSchema } from '../snowflake/snowflake'

/** Distinct emoji one message can collect. */
export const REACTIONS_PER_MESSAGE_MAX = 20
/** How many reacting users one request lists. */
export const REACTION_USERS_PAGE_MAX = 100

/**
 * One whole emoji (with skin tones, ZWJ sequences, flags, keycaps) and nothing else. The `v`
 * flag knows emoji sequences; engines without it get a close approximation.
 */
const createSingleEmojiPattern = (): RegExp => {
  try {
    return new RegExp('^\\p{RGI_Emoji}$', 'v')
  } catch {
    return /^(?:\p{Regional_Indicator}{2}|[#*0-9]️?⃣|\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})*(?:‍\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})*)*)$/u
  }
}

let singleEmoji: RegExp | null = null

export const isSingleEmoji = (value: string): boolean =>
  (singleEmoji ??= createSingleEmojiPattern()).test(value)

/** A single Unicode emoji, or a server emoji written `<:name:id>`. */
export const reactionEmojiSchema = z
  .string()
  .max(64)
  .refine(
    (value) => isSingleEmoji(value) || /^<a?:[A-Za-z0-9_]{2,32}:[1-9]\d{0,18}>$/.test(value),
    'Expected a single emoji',
  )

/** An emoji on a message: how many reacted, and whether the viewer is one of them. */
export const reactionSchema = z.object({
  emoji: z.string(),
  count: z.number().int().positive(),
  me: z.boolean(),
})

/** Someone added or removed a reaction (gateway). */
export const reactionEventSchema = z.object({
  channelId: snowflakeSchema,
  /** null in direct messages. */
  guildId: snowflakeSchema.nullable(),
  messageId: snowflakeSchema,
  userId: snowflakeSchema,
  emoji: z.string(),
})

/**
 * One person's reactions to a message in an encrypted conversation: their whole set of emoji,
 * encrypted for the conversation. The server knows that they reacted, not with what.
 */
export const encryptedReactionSchema = z.object({
  userId: snowflakeSchema,
  /** Changes with every new set (each is a new MLS message, decrypted on its own). */
  version: snowflakeSchema,
  ciphertext: z.string(),
})

export const encryptedReactionEventSchema = z.object({
  channelId: snowflakeSchema,
  guildId: snowflakeSchema.nullable(),
  messageId: snowflakeSchema,
  userId: snowflakeSchema,
  /** null once the person took back every reaction. */
  reaction: z.object({ version: snowflakeSchema, ciphertext: z.string() }).nullable(),
})

export type Reaction = z.infer<typeof reactionSchema>
export type ReactionEvent = z.infer<typeof reactionEventSchema>
export type EncryptedReaction = z.infer<typeof encryptedReactionSchema>
export type EncryptedReactionEvent = z.infer<typeof encryptedReactionEventSchema>
