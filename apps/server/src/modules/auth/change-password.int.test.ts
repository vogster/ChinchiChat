import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { SESSION_COOKIE, WEB_ORIGIN, registerUser } from '../../../test/auth-helpers'
import { createTestApp, resetState } from '../../../test/test-app'
import { MAX_FAILED_LOGINS } from './login-throttle'

const { app, db, redis, close } = createTestApp()

const headersFor = (token: string | undefined) => ({
  origin: WEB_ORIGIN,
  ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}),
})

const changePassword = (token: string | undefined, payload: object, remoteAddress = '127.0.0.1') =>
  app.inject({
    method: 'POST',
    url: '/api/v1/auth/password/change',
    headers: headersFor(token),
    payload,
    remoteAddress,
  })

const login = async (password: string) => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { origin: WEB_ORIGIN },
    payload: { login: 'alice', password },
  })
  return {
    status: response.statusCode,
    cookie: response.cookies.find((c) => c.name === SESSION_COOKIE)?.value,
  }
}

const me = (token: string | undefined) =>
  app.inject({ method: 'GET', url: '/api/v1/users/@me', headers: headersFor(token) })

beforeEach(async () => {
  await resetState(db, redis)
})

afterAll(async () => {
  await close()
})

describe('POST /api/v1/auth/password/change', () => {
  it('changes the password when the current one is correct', async () => {
    const { cookie } = await registerUser(app, { password: 'old-password' })

    const response = await changePassword(cookie, {
      currentPassword: 'old-password',
      newPassword: 'new-password',
    })

    expect(response.statusCode).toBe(200)
    expect((await login('old-password')).status).toBe(401)
    expect((await login('new-password')).status).toBe(200)
  })

  it('keeps the current session and signs out all others', async () => {
    const { cookie } = await registerUser(app, { password: 'old-password' })
    const other = await login('old-password')

    await changePassword(cookie, { currentPassword: 'old-password', newPassword: 'new-password' })

    expect((await me(cookie)).statusCode).toBe(200)
    expect((await me(other.cookie)).statusCode).toBe(401)
  })

  it('rejects a wrong current password', async () => {
    const { cookie } = await registerUser(app, { password: 'old-password' })

    const response = await changePassword(cookie, {
      currentPassword: 'not-it',
      newPassword: 'new-password',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ code: 'INVALID_CURRENT_PASSWORD' })
    expect((await login('old-password')).status).toBe(200)
  })

  it('stops guessing the current password from a stolen session', async () => {
    const { cookie } = await registerUser(app, { password: 'old-password' })
    for (let i = 0; i < MAX_FAILED_LOGINS; i += 1) {
      // From many addresses: the per-IP limit alone wouldn't stop this.
      await changePassword(
        cookie,
        { currentPassword: `guess-${i}`, newPassword: 'new-password' },
        `10.0.0.${i + 1}`,
      )
    }

    const locked = await changePassword(
      cookie,
      { currentPassword: 'old-password', newPassword: 'new-password' },
      '10.0.1.1',
    )
    expect(locked.statusCode).toBe(429)
    expect(locked.json().code).toBe('LOGIN_LOCKED')
  })

  it('validates the new password', async () => {
    const { cookie } = await registerUser(app, { password: 'old-password' })

    const response = await changePassword(cookie, {
      currentPassword: 'old-password',
      newPassword: 'short',
    })
    expect(response.json()).toMatchObject({ code: 'VALIDATION_FAILED' })
  })

  it('requires authentication', async () => {
    const response = await changePassword(undefined, {
      currentPassword: 'old-password',
      newPassword: 'new-password',
    })
    expect(response.statusCode).toBe(401)
  })
})
