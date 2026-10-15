import { afterEach, describe, expect, inject, it } from 'vitest'

import { createRedis } from '../redis/client'
import { createRedisEventBus } from './redis-event-bus'

import type { SequencedEvent } from './event-bus'
import type { RedisHandle } from '../redis/client'

const handles: RedisHandle[] = []
const buses: { close(): Promise<void> }[] = []

const connect = async (options: { stream: string; maxLength?: number }) => {
  const handle = createRedis(inject('redisUrl'))
  handles.push(handle)
  const bus = await createRedisEventBus(handle.redis, options)
  buses.push(bus)
  return bus
}

const waitFor = async (predicate: () => boolean) => {
  for (let i = 0; i < 100 && !predicate(); i += 1) await new Promise((r) => setTimeout(r, 20))
  expect(predicate()).toBe(true)
}

afterEach(async () => {
  await Promise.all(buses.splice(0).map((bus) => bus.close()))
  await Promise.all(handles.splice(0).map((handle) => handle.close()))
})

describe('createRedisEventBus', () => {
  it('fans events out to every process, in order', async () => {
    const stream = `test:${Date.now()}:fanout`
    const a = await connect({ stream })
    const b = await connect({ stream })
    const received: SequencedEvent[] = []
    b.onEvent((event) => received.push(event))

    const s1 = await a.publish({ topic: 'guild:1', type: 'MESSAGE_CREATE', data: { n: 1 } })
    const s2 = await a.publish({ topic: 'guild:1', type: 'MESSAGE_CREATE', data: { n: 2 } })

    await waitFor(() => received.length === 2)
    expect(received).toEqual([
      { topic: 'guild:1', type: 'MESSAGE_CREATE', data: { n: 1 }, seq: s1 },
      { topic: 'guild:1', type: 'MESSAGE_CREATE', data: { n: 2 }, seq: s2 },
    ])
    expect(s2).toBeGreaterThan(s1)
    expect(await b.latestSeq()).toBe(s2)
  })

  it('replays events after a sequence number for resumed sessions', async () => {
    const stream = `test:${Date.now()}:replay`
    const bus = await connect({ stream })
    const s1 = await bus.publish({ topic: 'user:1', type: 'A', data: 1 })
    await bus.publish({ topic: 'user:1', type: 'B', data: 2 })

    expect((await bus.replay(s1))?.map((e) => e.type)).toEqual(['B'])
  })

  it('reports when the requested history was already trimmed', async () => {
    const stream = `test:${Date.now()}:trim`
    const bus = await connect({ stream, maxLength: 3 })
    const first = await bus.publish({ topic: 'user:1', type: 'E0', data: 0 })
    for (let i = 1; i <= 10; i += 1) await bus.publish({ topic: 'user:1', type: `E${i}`, data: i })

    expect(await bus.replay(first)).toBeNull()
  })

  it('starts at the current end of an existing stream', async () => {
    const stream = `test:${Date.now()}:start`
    const writer = await connect({ stream })
    const before = await writer.publish({ topic: 'user:1', type: 'OLD', data: null })

    const late = await connect({ stream })
    const seen: string[] = []
    late.onEvent((event) => seen.push(event.type))
    await writer.publish({ topic: 'user:1', type: 'NEW', data: null })

    await waitFor(() => seen.length === 1)
    expect(seen).toEqual(['NEW'])
    expect(await late.latestSeq()).toBeGreaterThan(before)
  })
})
