import { describe, expect, it } from 'vitest'

import { collectMentions, isEmojiOnly } from './analyze'
import { parseMarkdown } from './parse'

describe('collectMentions', () => {
  it('finds mentions anywhere, once each, but not in code', () => {
    const doc = parseMarkdown(
      '<@1> **hey <@2> and <@1>** ||<@&9>|| <#5>\n> @here\n`<@3>`\n```\n@everyone\n```',
    )
    expect(collectMentions(doc)).toEqual({
      users: ['1', '2'],
      roles: ['9'],
      channels: ['5'],
      everyone: false,
      here: true,
    })
  })

  it('counts each id once', () => {
    expect(collectMentions(parseMarkdown('<@1> <@!1> <@1>')).users).toEqual(['1'])
  })

  it('reports @everyone', () => {
    expect(collectMentions(parseMarkdown('@everyone look')).everyone).toBe(true)
  })

  it('is empty for plain text', () => {
    expect(collectMentions(parseMarkdown('hello'))).toEqual({
      users: [],
      roles: [],
      channels: [],
      everyone: false,
      here: false,
    })
  })
})

describe('isEmojiOnly', () => {
  it('counts custom emoji', () => {
    expect(isEmojiOnly(parseMarkdown('<:cat:1> <:dog:2>'))).toBe(true)
    expect(isEmojiOnly(parseMarkdown('<:cat:1> мяу'))).toBe(false)
  })

  it.each([
    ['🎉', true],
    ['🎉 🎉\n🎉', true],
    ['🎉 hi', false],
    ['', false],
    ['  ', false],
    ['**🎉**', false],
    [`${'🎉'.repeat(31)}`, false],
  ])('%j → %s', (input, expected) => {
    expect(isEmojiOnly(parseMarkdown(input))).toBe(expected)
  })
})
