import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { WEB_ORIGIN, registerUser } from '../../../test/auth-helpers'
import { createOutbox } from '../../../test/outbox'
import { createTestApp, resetState } from '../../../test/test-app'
import { MAX_FAILED_LOGINS, MAX_FAILED_LOGINS_PER_ACCOUNT } from './login-throttle'

// The per-IP limit is off: this is about guessing one account from many addresses.
const outbox = createOutbox()
const { app, db, redis, close } = createTestApp({
  env: { RATE_LIMIT: 'off', PUBLIC_URL: 'https://chat.example.com' },
  mailer: outbox.mailer,
})

const login = (loginName: string, password: string, remoteAddress = '127.0.0.1') =>
  app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { origin: WEB_ORIGIN },
    payload: { login: loginName, password },
    remoteAddress,
  })

const failTimes = async (count: number, loginName = 'alice', from = () => '127.0.0.1') => {
  for (let i = 0; i < count; i += 1) await login(loginName, `wrong-${i}`, from())
}

beforeEach(async () => {
  await resetState(db, redis)
  outbox.clear()
  await registerUser(app, { username: 'alice', email: 'alice@example.com' })
})

afterAll(async () => {
  await close()
})

describe('locking an account after failed logins', () => {
  it('refuses even the right password once too many guesses failed', async () => {
    await failTimes(MAX_FAILED_LOGINS)

    const response = await login('alice', 'password123')

    expect(response.statusCode).toBe(429)
    expect(response.json().code).toBe('LOGIN_LOCKED')
  })

  it("doesn't let guesses from elsewhere lock the owner out", async () => {
    await failTimes(MAX_FAILED_LOGINS, 'alice', () => '203.0.113.5')

    expect((await login('alice', 'password123', '203.0.113.5')).statusCode).toBe(429)
    expect((await login('alice', 'password123', '198.51.100.7')).statusCode).toBe(200)
  })

  it('treats one IPv6 network as one address', async () => {
    let host = 0
    await failTimes(MAX_FAILED_LOGINS, 'alice', () => `2001:db8:1:2::${(host += 1).toString(16)}`)

    expect((await login('alice', 'password123', '2001:db8:1:2::ffff')).statusCode).toBe(429)
  })

  it('still stops guessing spread over many addresses', async () => {
    let host = 0
    await failTimes(
      MAX_FAILED_LOGINS_PER_ACCOUNT,
      'alice',
      () => `10.0.${host >> 8}.${(host += 1) & 255}`,
    )

    expect((await login('alice', 'password123', '198.51.100.7')).statusCode).toBe(429)
  }, 60_000)

  it('counts each spelling of the login apart, so a lock links no email to a name', async () => {
    await failTimes(MAX_FAILED_LOGINS, 'alice@example.com')

    expect((await login('alice@example.com', 'password123')).statusCode).toBe(429)
    expect((await login('alice', 'password123')).statusCode).toBe(200)
  })

  it('counts simultaneous guesses before checking them', async () => {
    const responses = await Promise.all(
      Array.from({ length: MAX_FAILED_LOGINS * 2 }, (_, i) => login('alice', `wrong-${i}`)),
    )

    const checked = responses.filter((r) => r.statusCode === 401)
    expect(checked.length).toBeLessThanOrEqual(MAX_FAILED_LOGINS)
  })

  it('forgets failed guesses after a successful login', async () => {
    await failTimes(MAX_FAILED_LOGINS - 1)
    expect((await login('alice', 'password123')).statusCode).toBe(200)

    await failTimes(MAX_FAILED_LOGINS - 1)
    expect((await login('alice', 'password123')).statusCode).toBe(200)
  })

  it('unlocks once the owner resets the password by email', async () => {
    await failTimes(MAX_FAILED_LOGINS)
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password/forgot',
      headers: { origin: WEB_ORIGIN },
      payload: { email: 'alice@example.com' },
    })
    const message = await outbox.waitForMessage('alice@example.com', /сброс пароля/i)
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password/reset',
      headers: { origin: WEB_ORIGIN },
      payload: { token: outbox.tokenFrom(message, '/reset-password'), password: 'new-password' },
    })

    expect((await login('alice', 'new-password')).statusCode).toBe(200)
  })

  it('answers the same way for logins that do not exist', async () => {
    await failTimes(MAX_FAILED_LOGINS, 'nobody')

    const response = await login('nobody', 'whatever')
    expect(response.statusCode).toBe(429)
    expect(response.json().code).toBe('LOGIN_LOCKED')
  })
})
