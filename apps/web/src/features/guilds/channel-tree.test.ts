import { describe, expect, it } from 'vitest'

import { buildChannelTree, firstTextChannel } from './channel-tree'

import type { Channel } from '@chinchi/shared'

const ch = (
  id: string,
  type: Channel['type'],
  position: number,
  parentId: string | null = null,
): Channel => ({
  id,
  guildId: 'g',
  type,
  name: `c${id}`,
  topic: null,
  parentId,
  position,
  lastMessageId: null,
  permissionOverwrites: [],
  rateLimitPerUser: 0,
  nsfw: false,
  announcement: false,
  threadStarterId: null,
  messageCount: 0,
  ownerId: null,
})

describe('buildChannelTree', () => {
  it('puts uncategorized channels first, then categories with their sorted children', () => {
    const tree = buildChannelTree([
      ch('10', 'category', 1),
      ch('11', 'text', 1, '10'),
      ch('12', 'text', 0, '10'),
      ch('20', 'category', 0),
      ch('21', 'voice', 0, '20'),
      ch('1', 'text', 0),
    ])

    expect(tree.uncategorized.map((c) => c.id)).toEqual(['1'])
    expect(
      tree.categories.map(({ category, channels }) => [category.id, channels.map((c) => c.id)]),
    ).toEqual([
      ['20', ['21']],
      ['10', ['12', '11']],
    ])
  })

  it('breaks position ties by id so the order is stable', () => {
    const tree = buildChannelTree([ch('9', 'text', 0), ch('3', 'text', 0)])
    expect(tree.uncategorized.map((c) => c.id)).toEqual(['3', '9'])
  })

  it('treats channels whose category is missing as uncategorized', () => {
    const tree = buildChannelTree([ch('5', 'text', 0, 'gone')])
    expect(tree.uncategorized.map((c) => c.id)).toEqual(['5'])
  })
})

describe('firstTextChannel', () => {
  it('follows the visual order', () => {
    const channels = [ch('10', 'category', 0), ch('11', 'text', 0, '10'), ch('2', 'voice', 0)]
    expect(firstTextChannel(channels)?.id).toBe('11')
  })

  it('returns undefined when there are no text channels', () => {
    expect(firstTextChannel([ch('2', 'voice', 0)])).toBeUndefined()
  })
})
