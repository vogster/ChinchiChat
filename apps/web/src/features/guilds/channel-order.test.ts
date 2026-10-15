import { describe, expect, it } from 'vitest'

import { applyChannelOrder, planChannelMove } from './channel-order'

import type { Channel } from '@chinchi/shared'

const channel = (overrides: Partial<Channel> & Pick<Channel, 'id' | 'type'>): Channel => ({
  guildId: '1',
  name: overrides.id,
  topic: null,
  parentId: null,
  position: 0,
  lastMessageId: null,
  rateLimitPerUser: 0,
  nsfw: false,
  announcement: false,
  permissionOverwrites: [],
  threadStarterId: null,
  messageCount: 0,
  ownerId: null,
  ...overrides,
})

const channels = [
  channel({ id: 'cat-a', type: 'category', position: 0 }),
  channel({ id: 'cat-b', type: 'category', position: 1 }),
  channel({ id: 'a1', type: 'text', parentId: 'cat-a', position: 0 }),
  channel({ id: 'a2', type: 'text', parentId: 'cat-a', position: 1 }),
  channel({ id: 'a3', type: 'voice', parentId: 'cat-a', position: 2 }),
  channel({ id: 'b1', type: 'text', parentId: 'cat-b', position: 0 }),
  channel({ id: 'loose', type: 'text', position: 0 }),
  channel({ id: 't1', type: 'thread', parentId: 'a1', position: 0 }),
]

describe('planChannelMove', () => {
  it('moves a channel down past its neighbour, renumbering only what changed', () => {
    expect(planChannelMove(channels, 'a1', { channelId: 'a2' })).toEqual([
      { id: 'a2', position: 0 },
      { id: 'a1', position: 1 },
    ])
  })

  it('moves a channel up in front of the target', () => {
    expect(planChannelMove(channels, 'a3', { channelId: 'a1' })).toEqual([
      { id: 'a3', position: 0 },
      { id: 'a1', position: 1 },
      { id: 'a2', position: 2 },
    ])
  })

  it('moves a channel into another category, before the target', () => {
    expect(planChannelMove(channels, 'a2', { channelId: 'b1' })).toEqual([
      { id: 'a2', position: 0, parentId: 'cat-b' },
      { id: 'b1', position: 1 },
    ])
  })

  it('drops a channel at the end of a category from its header', () => {
    expect(planChannelMove(channels, 'loose', { categoryId: 'cat-b' })).toEqual([
      { id: 'loose', position: 1, parentId: 'cat-b' },
    ])
  })

  it('reorders categories among themselves', () => {
    expect(planChannelMove(channels, 'cat-b', { categoryId: 'cat-a' })).toEqual([
      { id: 'cat-b', position: 0 },
      { id: 'cat-a', position: 1 },
    ])
  })

  it('ignores moves that change nothing or make no sense', () => {
    expect(planChannelMove(channels, 'a1', { channelId: 'a1' })).toEqual([])
    expect(planChannelMove(channels, 'cat-a', { channelId: 'b1' })).toEqual([])
    expect(planChannelMove(channels, 't1', { channelId: 'a2' })).toEqual([])
    expect(planChannelMove(channels, 'a1', { channelId: 'missing' })).toEqual([])
    expect(planChannelMove(channels, 'a3', { categoryId: 'cat-a' })).toEqual([])
  })
})

describe('applyChannelOrder', () => {
  it('applies positions and parents without touching other channels', () => {
    const moved = applyChannelOrder(channels, [{ id: 'a2', position: 0, parentId: 'cat-b' }])
    expect(moved.find((c) => c.id === 'a2')).toMatchObject({ position: 0, parentId: 'cat-b' })
    expect(moved.find((c) => c.id === 'a1')).toBe(channels.find((c) => c.id === 'a1'))
  })
})
