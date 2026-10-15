import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'

import { identify } from '../../test/gateway-client'
import { addMember, createGuild, signUp } from '../../test/guild-helpers'
import { createTestApp, resetState } from '../../test/test-app'
import { createRedisEventBus } from '../events/redis-event-bus'
import { createRedis } from '../redis/client'

import type { EventBus } from '../events/event-bus'
import type { RedisHandle } from '../redis/client'

/** Two server processes of one instance, sharing Postgres and the Valkey event stream. */
describe('gateway across server processes', () => {
  const stream = `test:${Date.now()}:cluster`
  const handles: RedisHandle[] = []
  const buses: EventBus[] = []
  let first: ReturnType<typeof createTestApp>
  let second: ReturnType<typeof createTestApp>

  beforeAll(async () => {
    for (let i = 0; i < 2; i += 1) {
      const handle = createRedis(inject('redisUrl'))
      handles.push(handle)
      buses.push(await createRedisEventBus(handle.redis, { stream }))
    }
    first = createTestApp({ bus: buses[0] as EventBus })
    second = createTestApp({ bus: buses[1] as EventBus })
    await Promise.all([
      first.app.listen({ host: '127.0.0.1', port: 0 }),
      second.app.listen({ host: '127.0.0.1', port: 0 }),
    ])
    await resetState(first.db, first.redis)
  })

  afterAll(async () => {
    await Promise.all([first.close(), second.close()])
    await Promise.all(buses.map((bus) => bus.close()))
    await Promise.all(handles.map((handle) => handle.close()))
  })

  it('delivers a message posted on one process to a client connected to the other', async () => {
    const owner = await signUp(first.app, { username: 'owner', email: 'owner@example.com' })
    const member = await signUp(first.app, { username: 'member', email: 'member@example.com' })
    const guild = await createGuild(first.app, owner)
    await addMember(first.db, guild.id, member.id)
    const textId = guild.channels.find((c) => c.type === 'text')?.id

    const { socket } = await identify(second.app, member.cookie)
    try {
      await first.app.inject({
        method: 'POST',
        url: `/api/v1/channels/${textId}/messages`,
        headers: owner.headers,
        payload: { content: 'across the cluster' },
      })

      const message = await socket.dispatch<{ content: string }>('MESSAGE_CREATE')
      expect(message.content).toBe('across the cluster')
    } finally {
      socket.close()
    }
  })
})
