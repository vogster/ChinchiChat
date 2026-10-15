import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { WEB_ORIGIN, createTestApp, resetState } from '../../test/test-app'
import { LOGIN_RATE_LIMIT, REGISTER_RATE_LIMIT } from './rate-limit'

const first = createTestApp()
const second = createTestApp()
const disabled = createTestApp({ env: { RATE_LIMIT: 'off' } })

// A fresh login name each time, so the per-account lockout never kicks in here.
let attempt = 0
const login = (target = first, remoteAddress = '10.0.0.1') =>
  target.app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    remoteAddress,
    headers: { origin: WEB_ORIGIN },
    payload: { login: `nobody${(attempt += 1)}`, password: 'password123' },
  })

const register = (index: number, remoteAddress = '10.0.0.2') =>
  first.app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    remoteAddress,
    headers: { origin: WEB_ORIGIN },
    payload: {
      username: `user${index}`,
      email: `user${index}@example.com`,
      password: 'password123',
    },
  })

const exhaust = async (attempts: number, send: (index: number) => Promise<unknown>) => {
  for (let index = 0; index < attempts; index += 1) {
    await send(index)
  }
}

beforeEach(async () => {
  await resetState(first.db, first.redis)
})

afterAll(async () => {
  await Promise.all([first.close(), second.close(), disabled.close()])
})

describe('rate limiting', () => {
  it('limits login attempts per IP and answers with the error envelope', async () => {
    await exhaust(LOGIN_RATE_LIMIT.max, () => login())

    const response = await login()

    expect(response.statusCode).toBe(429)
    expect(response.json()).toMatchObject({ success: false, code: 'RATE_LIMITED' })
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0)
  })

  it('tracks each IP separately', async () => {
    await exhaust(LOGIN_RATE_LIMIT.max, () => login())

    const response = await login(first, '10.0.0.99')
    expect(response.statusCode).toBe(401)
  })

  it('shares counters between server instances through Valkey', async () => {
    await exhaust(LOGIN_RATE_LIMIT.max, () => login(first))

    const response = await login(second)
    expect(response.statusCode).toBe(429)
  })

  it('limits registrations per IP', async () => {
    await exhaust(REGISTER_RATE_LIMIT.max, (index) => register(index))

    const response = await register(999)
    expect(response.statusCode).toBe(429)
  })

  it('reports remaining quota in headers', async () => {
    const response = await login()

    expect(response.headers['x-ratelimit-limit']).toBe(String(LOGIN_RATE_LIMIT.max))
    expect(response.headers['x-ratelimit-remaining']).toBe(String(LOGIN_RATE_LIMIT.max - 1))
  })

  it('can be disabled for local testing', async () => {
    await exhaust(LOGIN_RATE_LIMIT.max, () => login(disabled))

    const response = await login(disabled)
    expect(response.statusCode).toBe(401)
  })
})
