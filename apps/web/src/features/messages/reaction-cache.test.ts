import { describe, expect, it } from 'vitest'

import { withReaction } from './reaction-cache'

const thumbs = { emoji: '👍', count: 2, me: false }

describe('withReaction', () => {
  it('adds a new emoji at the end', () => {
    expect(withReaction([thumbs], { emoji: '🎉', add: true, mine: true })).toEqual([
      thumbs,
      { emoji: '🎉', count: 1, me: true },
    ])
  })

  it('joins an existing emoji', () => {
    expect(withReaction([thumbs], { emoji: '👍', add: true, mine: true })).toEqual([
      { emoji: '👍', count: 3, me: true },
    ])
    expect(withReaction([thumbs], { emoji: '👍', add: true, mine: false })).toEqual([
      { emoji: '👍', count: 3, me: false },
    ])
  })

  it('ignores the echo of my own change', () => {
    const mine = [{ emoji: '👍', count: 3, me: true }]
    expect(withReaction(mine, { emoji: '👍', add: true, mine: true })).toEqual(mine)
    expect(withReaction([thumbs], { emoji: '👍', add: false, mine: true })).toEqual([thumbs])
  })

  it('removes, dropping emoji nobody uses any more', () => {
    expect(withReaction([thumbs], { emoji: '👍', add: false, mine: false })).toEqual([
      { emoji: '👍', count: 1, me: false },
    ])
    expect(
      withReaction([{ emoji: '👍', count: 1, me: true }], { emoji: '👍', add: false, mine: true }),
    ).toEqual([])
    expect(withReaction([thumbs], { emoji: '🎉', add: false, mine: false })).toEqual([thumbs])
  })
})
