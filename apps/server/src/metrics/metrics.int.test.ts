import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { identify } from '../../test/gateway-client'
import { createGuild, signUp } from '../../test/guild-helpers'
import { createTestApp, resetState } from '../../test/test-app'

import type { TestActor } from '../../test/guild-helpers'

const { app, db, redis, close } = createTestApp({ env: { RATE_LIMIT: 'off' } })

let owner: TestActor

const scrape = () => app.metrics.registry.metrics()

beforeAll(async () => {
  await app.listen({ host: '127.0.0.1', port: 0 })
})

beforeEach(async () => {
  await resetState(db, redis)
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
})

afterAll(async () => {
  await close()
})

describe('app metrics', () => {
  it('time HTTP requests by route pattern, not by URL', async () => {
    const guild = await createGuild(app, owner)
    await app.inject({ method: 'GET', url: `/api/v1/guilds/${guild.id}`, headers: owner.headers })

    const text = await scrape()
    expect(text).toMatch(
      /chinchi_http_request_duration_seconds_count\{method="GET",route="\/api\/v1\/guilds\/:guildId",status_code="200"\} \d+/,
    )
    expect(text).not.toContain(guild.id)
  })

  it('track gateway connections, dispatches and published events', async () => {
    const { socket } = await identify(app, owner.cookie)
    expect(await scrape()).toContain('chinchi_gateway_connections 1')

    await createGuild(app, owner)
    await socket.next((frame) => frame.t === 'GUILD_CREATE')
    const text = await scrape()
    expect(text).toMatch(/chinchi_gateway_dispatches_total\{type="READY"\} 1/)
    expect(text).toMatch(/chinchi_gateway_ready_seconds_count 1/)
    expect(text).toMatch(/chinchi_gateway_dispatches_total\{type="GUILD_CREATE"\} \d+/)
    expect(text).toMatch(/chinchi_events_published_total\{type="GUILD_CREATE"\} \d+/)

    socket.close()
    await expect.poll(scrape).toContain('chinchi_gateway_connections 0')
  })

  it('count background jobs the scheduler runs', async () => {
    await app.scheduler?.tick()
    expect(await scrape()).toContain(
      'chinchi_background_jobs_total{kind="presence-sweep",outcome="ok"} 1',
    )
  })
})
