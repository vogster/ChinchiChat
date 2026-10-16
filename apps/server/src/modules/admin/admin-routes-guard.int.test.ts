import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { registerUser, SESSION_COOKIE, WEB_ORIGIN } from '../../../test/auth-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

interface Route {
  readonly method: string
  readonly url: string
}

const routes: Route[] = []
const { app, db, redis, close } = createTestApp({
  env: { RATE_LIMIT: 'off', INITIAL_ADMIN_EMAIL: 'admin@example.com' },
})
// Plugins load on ready(), so a hook added now still sees every route they register.
app.addHook('onRoute', (route) => {
  if (!route.url.startsWith('/api/v1/admin')) return
  for (const method of [route.method].flat()) {
    if (method !== 'HEAD') routes.push({ method, url: route.url })
  }
})

beforeAll(async () => {
  await app.ready()
  await resetState(db, redis)
})

afterAll(async () => {
  await close()
})

describe('instance administration routes', () => {
  it('every one of them answers 403 NOT_ADMIN to a signed-in user who is not an admin', async () => {
    expect(routes.length).toBeGreaterThanOrEqual(10)
    const { cookie } = await registerUser(app, { username: 'bob', email: 'bob@example.com' })

    for (const { method, url } of routes) {
      const response = await app.inject({
        method: method as 'GET',
        url: url.replace(/:\w+/g, '1'),
        headers: { origin: WEB_ORIGIN, cookie: `${SESSION_COOKIE}=${cookie}` },
        ...(method === 'GET' || method === 'DELETE' ? {} : { payload: {} }),
      })
      expect([response.statusCode, response.json().code], `${method} ${url}`).toEqual([
        403,
        'NOT_ADMIN',
      ])
    }
  })

  it('and 401 to nobody at all', async () => {
    for (const { method, url } of routes) {
      const response = await app.inject({
        method: method as 'GET',
        url: url.replace(/:\w+/g, '1'),
        headers: { origin: WEB_ORIGIN },
        ...(method === 'GET' || method === 'DELETE' ? {} : { payload: {} }),
      })
      expect(response.statusCode, `${method} ${url}`).toBe(401)
    }
  })
})
