import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { SESSION_COOKIE, WEB_ORIGIN, registerUser } from '../../test/auth-helpers'
import { createTestApp, resetState } from '../../test/test-app'

const behindProxy = createTestApp({ env: { TRUST_PROXY: '127.0.0.1' } })
const direct = createTestApp()

const sessionIp = async (target: typeof direct) => {
  const { cookie } = await registerUser(target.app)
  const response = await target.app.inject({
    method: 'GET',
    url: '/api/v1/auth/sessions',
    headers: { cookie: `${SESSION_COOKIE}=${cookie}`, origin: WEB_ORIGIN },
  })
  return response.json().data.sessions[0].ipAddress as string
}

beforeEach(async () => {
  await resetState(direct.db, direct.redis)
})

afterAll(async () => {
  await Promise.all([behindProxy.close(), direct.close()])
})

describe('TRUST_PROXY', () => {
  it('uses X-Forwarded-For from a trusted proxy as the client IP', async () => {
    const response = await behindProxy.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      remoteAddress: '127.0.0.1',
      headers: { origin: WEB_ORIGIN, 'x-forwarded-for': '203.0.113.7' },
      payload: { username: 'alice', email: 'alice@example.com', password: 'password123' },
    })
    const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE)?.value

    const sessions = await behindProxy.app.inject({
      method: 'GET',
      url: '/api/v1/auth/sessions',
      headers: { cookie: `${SESSION_COOKIE}=${cookie}` },
    })
    expect(sessions.json().data.sessions[0].ipAddress).toBe('203.0.113.7')
  })

  it('supports a hop count', async () => {
    const hops = createTestApp({ env: { TRUST_PROXY: '1' } })
    try {
      const response = await hops.app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        headers: { origin: WEB_ORIGIN, 'x-forwarded-for': '198.51.100.4' },
        payload: { username: 'carol', email: 'carol@example.com', password: 'password123' },
      })
      expect(response.statusCode).toBe(201)
      const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE)?.value
      const sessions = await hops.app.inject({
        method: 'GET',
        url: '/api/v1/auth/sessions',
        headers: { cookie: `${SESSION_COOKIE}=${cookie}` },
      })
      expect(sessions.json().data.sessions[0].ipAddress).toBe('198.51.100.4')
    } finally {
      await hops.close()
    }
  })

  it('ignores X-Forwarded-For when no proxy is trusted', async () => {
    expect(await sessionIp(direct)).toBe('127.0.0.1')
  })
})
