import { CUSTOM_EMOJI_PATTERN, customEmojiText } from '@chinchi/shared'

import type { GuildEmoji } from '@chinchi/shared'

/**
 * Typed `:name:` becomes `<:name:id>` for the server's emoji (names match case-insensitively).
 * Unknown names, code spans and already written `<:name:id>` stay as they are.
 */
export const expandCustomEmoji = (text: string, emojis: readonly GuildEmoji[]): string => {
  if (emojis.length === 0) return text
  const byName = new Map(emojis.map((emoji) => [emoji.name.toLowerCase(), emoji]))
  // Code (``…`` or `…`) is kept verbatim: split it out and only touch the rest.
  return text
    .split(/(```[\s\S]*?```|`[^`\n]*`)/)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part.replace(
            /(?<![<\w/?=#&\\]a?):([A-Za-z0-9_]{2,32}):(?!\d)/g,
            (whole, name: string) => {
              const emoji = byName.get(name.toLowerCase())
              return emoji ? customEmojiText(emoji) : whole
            },
          ),
    )
    .join('')
}

/** How an emoji reads aloud: `:name:` for server emoji, itself otherwise. */
export const emojiLabel = (emoji: string) => {
  const match = CUSTOM_EMOJI_PATTERN.exec(emoji)
  return match ? `:${match[2]}:` : emoji
}
