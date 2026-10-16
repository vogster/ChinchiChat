import { describe, expect, it } from 'vitest'

import {
  CHANNEL_NAME_MAX_LENGTH,
  createChannelRequestSchema,
  createGuildRequestSchema,
  createInviteRequestSchema,
  createThreadRequestSchema,
  guildNameSchema,
  normalizeTextChannelName,
  reorderChannelsRequestSchema,
  updateGuildRequestSchema,
} from './guild.schemas'

describe('guildNameSchema', () => {
  it('trims and keeps unicode', () => {
    expect(guildNameSchema.parse('  Клуб любителей 🐈 ')).toBe('Клуб любителей 🐈')
  })

  it.each(['', ' ', 'a', 'x'.repeat(101)])('rejects %j', (name) => {
    expect(guildNameSchema.safeParse(name).success).toBe(false)
  })
})

describe('normalizeTextChannelName', () => {
  it.each([
    ['general', 'general'],
    ['  Off Topic  ', 'off-topic'],
    ['Мемы   и  картинки', 'мемы-и-картинки'],
    ['--a--b--', 'a-b'],
    ['Tab\tand\nnewline', 'tab-and-newline'],
  ])('%j → %j', (input, expected) => {
    expect(normalizeTextChannelName(input)).toBe(expected)
  })
})

describe('createChannelRequestSchema', () => {
  it('normalizes text channel names', () => {
    expect(createChannelRequestSchema.parse({ type: 'text', name: 'Off Topic' })).toEqual({
      type: 'text',
      name: 'off-topic',
      parentId: null,
    })
  })

  it('keeps voice and category names as typed', () => {
    expect(createChannelRequestSchema.parse({ type: 'voice', name: ' Lounge Room ' }).name).toBe(
      'Lounge Room',
    )
    expect(createChannelRequestSchema.parse({ type: 'category', name: 'Игры' }).name).toBe('Игры')
  })

  it('rejects names that normalize to nothing', () => {
    expect(createChannelRequestSchema.safeParse({ type: 'text', name: ' -- ' }).success).toBe(false)
  })

  it.each([
    { type: 'text', name: 'x'.repeat(CHANNEL_NAME_MAX_LENGTH + 1) },
    { type: 'forum', name: 'x' },
    { type: 'text', name: 'x', parentId: 'nope' },
    { type: 'category', name: 'x', parentId: '1' },
  ])('rejects %j', (body) => {
    expect(createChannelRequestSchema.safeParse(body).success).toBe(false)
  })
})

describe('createGuildRequestSchema', () => {
  it('defaults the locale for default channel names', () => {
    expect(createGuildRequestSchema.parse({ name: 'My server' })).toEqual({
      name: 'My server',
      locale: 'en',
    })
  })
})

describe('createInviteRequestSchema', () => {
  it('defaults to 7 days and unlimited uses', () => {
    expect(createInviteRequestSchema.parse({})).toEqual({ maxAgeSeconds: 604_800, maxUses: 0 })
  })

  it.each([{ maxAgeSeconds: -1 }, { maxAgeSeconds: 604_801 }, { maxUses: 101 }, { maxUses: 1.5 }])(
    'rejects %j',
    (body) => {
      expect(createInviteRequestSchema.safeParse(body).success).toBe(false)
    },
  )
})

describe('reorderChannelsRequestSchema', () => {
  it('accepts positions with optional parents', () => {
    const body = [
      { id: '1', position: 0 },
      { id: '2', position: 1, parentId: null },
      { id: '3', position: 0, parentId: '1' },
    ]
    expect(reorderChannelsRequestSchema.parse(body)).toEqual(body)
  })

  it('rejects duplicates and empty lists', () => {
    expect(reorderChannelsRequestSchema.safeParse([]).success).toBe(false)
    expect(
      reorderChannelsRequestSchema.safeParse([
        { id: '1', position: 0 },
        { id: '1', position: 1 },
      ]).success,
    ).toBe(false)
  })
})

describe('createThreadRequestSchema', () => {
  it('drops control and direction-override characters from the name', () => {
    expect(createThreadRequestSchema.parse({ name: ' Ре‮лиз\u0007 ' })).toEqual({ name: 'Релиз' })
    expect(createThreadRequestSchema.safeParse({ name: '‮​' }).success).toBe(false)
  })
})

describe('updateGuildRequestSchema', () => {
  it('takes a name, rules or both; blank rules turn them off', () => {
    expect(updateGuildRequestSchema.parse({ rules: '  Будьте вежливы  ' })).toEqual({
      rules: 'Будьте вежливы',
    })
    expect(updateGuildRequestSchema.parse({ rules: '   ' })).toEqual({ rules: null })
    expect(updateGuildRequestSchema.parse({ rules: null })).toEqual({ rules: null })
    expect(updateGuildRequestSchema.safeParse({}).success).toBe(false)
    expect(updateGuildRequestSchema.safeParse({ rules: 'x'.repeat(2001) }).success).toBe(false)
  })
})
