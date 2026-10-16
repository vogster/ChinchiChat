import { z } from 'zod'

import { snowflakeSchema } from '../snowflake/snowflake'

/** Emoji a server may have. */
export const MAX_GUILD_EMOJIS = 100
/** Uploads are small square pictures; anything bigger is a mistake. */
export const EMOJI_IMAGE_MAX_BYTES = 512 * 1024

/** As in Discord: latin letters, digits and `_`, used as `:name:` while typing. */
export const emojiNameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_]{2,32}$/, 'Use 2-32 latin letters, digits or "_"')

/** How a server emoji appears in message text. */
export const CUSTOM_EMOJI_PATTERN = /^<(a?):([A-Za-z0-9_]{2,32}):([1-9]\d{0,18})>$/

/** `<:name:id>` (`<a:name:id>` animated) for a server emoji, as in messages and reactions. */
export const customEmojiText = (emoji: { name: string; id: string; animated?: boolean }) =>
  `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`

/** The id of a server emoji written as `<:name:id>`, or null for anything else. */
export const customEmojiId = (text: string): string | null =>
  CUSTOM_EMOJI_PATTERN.exec(text)?.[3] ?? null

export const guildEmojiSchema = z.object({
  id: snowflakeSchema,
  name: z.string(),
  /** API path of the image (public, cacheable). */
  url: z.string(),
  /** The picture moves (animated WebP). */
  animated: z.boolean(),
})

export const createEmojiQuerySchema = z.object({ name: emojiNameSchema })
export const updateEmojiRequestSchema = z.strictObject({ name: emojiNameSchema })

/** Public path of a server emoji's image. */
export const customEmojiUrl = (id: string) => `/api/v1/emojis/${id}.webp`

export type GuildEmoji = z.infer<typeof guildEmojiSchema>
