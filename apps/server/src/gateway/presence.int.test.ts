import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest'

import { createMemoryEventBus } from '../events/event-bus'
import { createRedis } from '../redis/client'
import { createPresence } from './presence'

const cache = createRedis(inject('redisUrl'))
const TTL = 1000
let clock = 0
let events: ReturnType<typeof createMemoryEventBus>

const presence = () =>
  createPresence({
    redis: cache.redis,
    events,
    guildIdsFor: async () => ['9'],
    ttlMs: TTL,
    now: () => clock,
  })

const offlineAnnounced = (userId: string) =>
  events.published.filter(
    (e) =>
      e.type === 'PRESENCE_UPDATE' &&
      (e.data as { userId: string; status: string }).userId === userId &&
      (e.data as { status: string }).status === 'offline',
  ).length

beforeEach(async () => {
  await cache.redis.flushdb()
  events = createMemoryEventBus()
  clock = 1_000_000
})

afterAll(async () => {
  await cache.close()
})

describe('presence sweep', () => {
  it('takes offline the users whose process died without saying goodbye', async () => {
    const service = presence()
    await service.connect('1', 's1')
    await service.connect('2', 's2')
    clock += TTL / 2
    await service.refresh('2', 's2')

    clock += TTL * 0.75
    expect(await service.sweep()).toBe(1)

    expect(offlineAnnounced('1')).toBe(1)
    expect(offlineAnnounced('2')).toBe(0)
    expect(await service.visible(['1', '2'])).toEqual([{ userId: '2', status: 'online' }])
    // Already handled: a second sweep has nothing left to do.
    expect(await service.sweep()).toBe(0)
  })

  it('keeps users online while another device is still connected', async () => {
    const service = presence()
    await service.connect('1', 'old')
    clock += TTL / 2
    await service.connect('1', 'new')

    clock += TTL * 0.75
    await service.sweep()

    expect(offlineAnnounced('1')).toBe(0)
    expect(await service.visible(['1'])).toEqual([{ userId: '1', status: 'online' }])
  })

  it('stays quiet about invisible users', async () => {
    const service = presence()
    await service.connect('1', 's1')
    await service.setStatus('1', 'invisible')
    const before = events.published.length

    clock += TTL * 2
    await service.sweep()

    expect(events.published.length).toBe(before)
  })
})

describe('custom status', () => {
  const lastUpdate = () =>
    events.published.filter((e) => e.type === 'PRESENCE_UPDATE').at(-1)?.data as
      { userId: string; status: string; customStatus?: unknown } | undefined
  const holiday = { text: 'В отпуске', emoji: '🏖️', expiresAt: null }

  it('is announced with the status and shown to others while online', async () => {
    const service = presence()
    await service.connect('1', 's1')

    await service.setCustom('1', holiday)

    expect(lastUpdate()).toEqual({ userId: '1', status: 'online', customStatus: holiday })
    expect(await service.visible(['1'])).toEqual([
      { userId: '1', status: 'online', customStatus: holiday },
    ])
    expect(await service.custom('1')).toEqual(holiday)
  })

  it('clears itself at its end time', async () => {
    const service = presence()
    const expiresAt = new Date(Date.now() + 60_000).toISOString()

    await service.setCustom('1', { ...holiday, expiresAt })

    const ttl = await cache.redis.pttl('chinchi:presence:custom:1')
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(60_000)
  })

  it('stays hidden while invisible or offline, but the user still has it', async () => {
    const service = presence()
    await service.connect('1', 's1')
    await service.setStatus('1', 'invisible')
    const before = events.published.length

    await service.setCustom('1', holiday)

    expect(events.published.length).toBe(before)
    expect(await service.visible(['1'])).toEqual([])
    expect(await service.custom('1')).toEqual(holiday)
  })

  it('announces its removal', async () => {
    const service = presence()
    await service.connect('1', 's1')
    await service.setCustom('1', holiday)

    await service.setCustom('1', null)

    expect(lastUpdate()).toEqual({ userId: '1', status: 'online', customStatus: null })
    expect(await service.visible(['1'])).toEqual([{ userId: '1', status: 'online' }])
  })
})
