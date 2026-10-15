import { describe, expect, it } from 'vitest'

import { isSingleEmoji, reactionEmojiSchema } from './reaction.schemas'

describe('isSingleEmoji', () => {
  it.each(['👍', '❤️', '👍🏽', '👨‍👩‍👧', '🇷🇺', '🏳️‍🌈', '1️⃣'])('accepts %s', (emoji) => {
    expect(isSingleEmoji(emoji)).toBe(true)
  })

  it.each(['', 'a', '👍👍', '👍 ', ' 👍', ':smile:', '<b>', '1', '👍a'])('rejects %j', (value) => {
    expect(isSingleEmoji(value)).toBe(false)
  })
})

describe('reactionEmojiSchema', () => {
  it('accepts one emoji and rejects anything else', () => {
    expect(reactionEmojiSchema.parse('🎉')).toBe('🎉')
    expect(reactionEmojiSchema.safeParse('🎉🎉').success).toBe(false)
    expect(reactionEmojiSchema.safeParse('x'.repeat(100)).success).toBe(false)
  })
})
