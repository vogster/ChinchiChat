import { describe, expect, it } from 'vitest'

import { isCustomStatusActive, setCustomStatusRequestSchema } from './custom-status.schemas'

describe('setCustomStatusRequestSchema', () => {
  it('accepts text, an emoji or both, with an optional end', () => {
    expect(setCustomStatusRequestSchema.parse({ text: '  В отпуске ' })).toEqual({
      text: 'В отпуске',
    })
    expect(setCustomStatusRequestSchema.safeParse({ emoji: '🏖️' }).success).toBe(true)
    expect(setCustomStatusRequestSchema.safeParse({ emoji: '👩🏽‍💻' }).success).toBe(true)
    expect(
      setCustomStatusRequestSchema.safeParse({
        text: 'Обедаю',
        emoji: '🍜',
        expiresAt: '2026-10-15T13:00:00.000Z',
      }).success,
    ).toBe(true)
  })

  it('drops hidden characters from the text', () => {
    expect(setCustomStatusRequestSchema.parse({ text: 'a‮b\u0000c' }).text).toBe('abc')
  })

  it('needs something to show and rejects non-emoji and long text', () => {
    expect(setCustomStatusRequestSchema.safeParse({}).success).toBe(false)
    expect(setCustomStatusRequestSchema.safeParse({ text: '   ' }).success).toBe(false)
    expect(setCustomStatusRequestSchema.safeParse({ emoji: 'ab' }).success).toBe(false)
    expect(setCustomStatusRequestSchema.safeParse({ text: 'x'.repeat(129) }).success).toBe(false)
  })
})

describe('isCustomStatusActive', () => {
  const now = Date.parse('2026-10-15T12:00:00.000Z')
  it('holds until it expires', () => {
    expect(isCustomStatusActive({ text: 'a', emoji: null, expiresAt: null }, now)).toBe(true)
    expect(
      isCustomStatusActive({ text: 'a', emoji: null, expiresAt: '2026-10-15T11:00:00.000Z' }, now),
    ).toBe(false)
    expect(isCustomStatusActive(null, now)).toBe(false)
  })
})
