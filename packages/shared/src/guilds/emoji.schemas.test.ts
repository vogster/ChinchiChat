import { describe, expect, it } from 'vitest'

import { reactionEmojiSchema } from '../messages/reaction.schemas'
import { customEmojiId, customEmojiText, emojiNameSchema } from './emoji.schemas'

describe('server emoji', () => {
  it('have short latin names', () => {
    expect(emojiNameSchema.parse(' party_cat ')).toBe('party_cat')
    expect(emojiNameSchema.safeParse('кот').success).toBe(false)
    expect(emojiNameSchema.safeParse('x').success).toBe(false)
  })

  it('are written <:name:id>', () => {
    expect(customEmojiText({ name: 'cat', id: '123' })).toBe('<:cat:123>')
    expect(customEmojiId('<:cat:123>')).toBe('123')
    expect(customEmojiId('<a:dance:9>')).toBe('9')
    expect(customEmojiId('😀')).toBeNull()
  })

  it('can be reactions, like any single emoji', () => {
    expect(reactionEmojiSchema.safeParse('<:cat:123>').success).toBe(true)
    expect(reactionEmojiSchema.safeParse('😀').success).toBe(true)
    expect(reactionEmojiSchema.safeParse('<:cat:abc>').success).toBe(false)
    expect(reactionEmojiSchema.safeParse('cat').success).toBe(false)
  })
})
