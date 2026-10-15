import { describe, expect, it } from 'vitest'

import { findBlockedWord, updateAutomodRequestSchema } from './automod.schemas'

describe('findBlockedWord', () => {
  const words = ['казино', 'free money']

  it('finds whole words and phrases in any case', () => {
    expect(findBlockedWord('Лучшее КАЗИНО тут', words)).toBe('казино')
    expect(findBlockedWord('get FREE   money', words)).toBeNull()
    expect(findBlockedWord('get free money now!', words)).toBe('free money')
    expect(findBlockedWord('казино!', words)).toBe('казино')
  })

  it('leaves words that only contain a blocked one alone', () => {
    expect(findBlockedWord('казиноман', words)).toBeNull()
    expect(findBlockedWord('обычный текст', words)).toBeNull()
  })

  it('sees through full-width look-alikes', () => {
    expect(findBlockedWord('ｃａｓｉｎｏ', ['casino'])).toBe('casino')
  })

  it('ignores invisible characters slipped into a word', () => {
    expect(findBlockedWord('ка​зи­но', ['казино'])).toBe('казино')
    expect(findBlockedWord('ка⁠зино', ['казино'])).toBe('казино')
  })

  it('treats regex characters literally', () => {
    expect(findBlockedWord('a+b', ['a+b'])).toBe('a+b')
    expect(findBlockedWord('aab', ['a+b'])).toBeNull()
  })
})

describe('updateAutomodRequestSchema', () => {
  it('normalizes and dedupes the words', () => {
    expect(
      updateAutomodRequestSchema.parse({ blockedWords: [' Казино ', 'казино', 'Спам'] }),
    ).toEqual({
      blockedWords: ['казино', 'спам'],
    })
    expect(updateAutomodRequestSchema.safeParse({ blockedWords: ['  '] }).success).toBe(false)
    expect(updateAutomodRequestSchema.safeParse({}).success).toBe(false)
  })
})
