import { describe, expect, it, vi } from 'vitest'

import { createMemoryEventBus, guildTopic, userTopic } from './event-bus'

const event = (n: number) => ({ topic: guildTopic('1'), type: 'MESSAGE_CREATE', data: { n } })

describe('createMemoryEventBus', () => {
  it('assigns increasing sequence numbers and delivers to every listener', async () => {
    const bus = createMemoryEventBus()
    const listener = vi.fn()
    bus.onEvent(listener)

    const first = await bus.publish(event(1))
    const second = await bus.publish({ topic: userTopic('5'), type: 'GUILD_CREATE', data: {} })

    expect(second).toBeGreaterThan(first)
    expect(listener).toHaveBeenNthCalledWith(1, { ...event(1), seq: first })
    expect(await bus.latestSeq()).toBe(second)
    expect(bus.published).toEqual([
      event(1),
      { topic: userTopic('5'), type: 'GUILD_CREATE', data: {} },
    ])
  })

  it('stops delivering after unsubscribe', async () => {
    const bus = createMemoryEventBus()
    const listener = vi.fn()
    bus.onEvent(listener)()

    await bus.publish(event(1))
    expect(listener).not.toHaveBeenCalled()
  })

  it('replays events after a sequence number', async () => {
    const bus = createMemoryEventBus()
    const seqs = []
    for (let n = 1; n <= 3; n += 1) seqs.push(await bus.publish(event(n)))

    const replayed = await bus.replay(seqs[0] as number)
    expect(replayed?.map((e) => e.data)).toEqual([{ n: 2 }, { n: 3 }])
    expect(await bus.replay(seqs[2] as number)).toEqual([])
  })

  it('cannot replay past what it retained', async () => {
    const bus = createMemoryEventBus({ retain: 2 })
    const first = await bus.publish(event(1))
    for (let n = 2; n <= 4; n += 1) await bus.publish(event(n))

    expect(await bus.replay(first)).toBeNull()
    expect(await bus.replay(0)).toBeNull()
  })

  it('starts empty and can be cleared for tests', async () => {
    const bus = createMemoryEventBus()
    expect(await bus.latestSeq()).toBe(0)
    expect(await bus.replay(0)).toEqual([])

    await bus.publish(event(1))
    bus.clear()
    await bus.close()
    expect(bus.published).toEqual([])
  })
})
