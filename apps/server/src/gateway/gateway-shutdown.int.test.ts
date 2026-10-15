import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { identify } from '../../test/gateway-client'
import { signUp } from '../../test/guild-helpers'
import { createTestApp, resetState } from '../../test/test-app'

const sessionsKey = (userId: string) => `chinchi:presence:sessions:${userId}`

/** Shutdown must finish per-connection cleanup before callers close Valkey and Postgres. */
describe('gateway shutdown', () => {
  let testApp: ReturnType<typeof createTestApp>

  beforeEach(async () => {
    testApp = createTestApp()
    await testApp.app.listen({ host: '127.0.0.1', port: 0 })
    await resetState(testApp.db, testApp.redis)
  })

  afterEach(async () => {
    await testApp.close()
  })

  it('clears presence of open connections before app.close() resolves', async () => {
    const { app, redis } = testApp
    const user = await signUp(app, { username: 'user', email: 'user@example.com' })
    await identify(app, user.cookie)
    expect(await redis.zcard(sessionsKey(user.id))).toBe(1)

    await app.close()

    expect(await redis.zcard(sessionsKey(user.id))).toBe(0)
  })

  it('clears presence of a client that disconnected right before shutdown', async () => {
    const { app, redis } = testApp
    const user = await signUp(app, { username: 'user', email: 'user@example.com' })
    const { socket } = await identify(app, user.cookie)

    socket.close()
    await app.close()

    expect(await redis.zcard(sessionsKey(user.id))).toBe(0)
  })
})
