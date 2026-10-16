import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import {
  registerUser,
  SESSION_COOKIE,
  sessionCookieOf,
  WEB_ORIGIN,
} from '../../../test/auth-helpers'
import { createTestApp, resetState } from '../../../test/test-app'
import { MAX_FAILED_LOGINS } from './login-throttle'
import { totpCode } from './totp'

const { app, db, redis, close } = createTestApp({ env: { RATE_LIMIT: 'off' } })

let cookie: string

const post = (url: string, payload: object, session: string | null = cookie) =>
  app.inject({
    method: 'POST',
    url: `/api/v1${url}`,
    headers: { origin: WEB_ORIGIN, ...(session ? { cookie: `${SESSION_COOKIE}=${session}` } : {}) },
    payload,
  })

const step = (offset = 0) => Math.floor(Date.now() / 30_000) + offset

/** Turns 2FA on and returns the secret and recovery codes. */
const enable = async () => {
  const setup = (await post('/users/@me/mfa/totp/setup', { password: 'password123' })).json().data
  const enabled = await post('/users/@me/mfa/totp/enable', { code: totpCode(setup.secret, step()) })
  return { secret: setup.secret as string, codes: enabled.json().data.recoveryCodes as string[] }
}

const login = (password = 'password123') => post('/auth/login', { login: 'alice', password }, null)

beforeEach(async () => {
  await resetState(db, redis)
  cookie = (await registerUser(app)).cookie as string
})

afterAll(async () => {
  await close()
})

describe('turning on 2FA', () => {
  it('needs the password, then a code from the app; gives recovery codes once', async () => {
    const wrong = await post('/users/@me/mfa/totp/setup', { password: 'nope-nope' })
    expect(wrong.statusCode).toBe(400)
    expect(wrong.json().code).toBe('INVALID_CURRENT_PASSWORD')

    const setup = await post('/users/@me/mfa/totp/setup', { password: 'password123' })
    expect(setup.statusCode).toBe(200)
    const { secret, uri } = setup.json().data
    expect(uri).toContain(`secret=${secret}`)

    const badCode = await post('/users/@me/mfa/totp/enable', { code: '000000' })
    expect(badCode.statusCode).toBe(400)
    expect(badCode.json().code).toBe('INVALID_MFA_CODE')

    const enabled = await post('/users/@me/mfa/totp/enable', { code: totpCode(secret, step()) })
    expect(enabled.statusCode).toBe(200)
    const codes = enabled.json().data.recoveryCodes
    expect(codes).toHaveLength(10)
    expect(codes[0]).toMatch(/^[a-z2-7]{5}-[a-z2-7]{5}$/)

    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/users/@me',
      headers: { cookie: `${SESSION_COOKIE}=${cookie}` },
    })
    expect(me.json().data.user.mfaEnabled).toBe(true)
    const again = await post('/users/@me/mfa/totp/setup', { password: 'password123' })
    expect(again.statusCode).toBe(409)
    expect(again.json().code).toBe('MFA_ALREADY_ENABLED')
  })
})

describe('signing in with 2FA', () => {
  it('asks for a code after the password and signs in with it', async () => {
    const { secret } = await enable()

    const first = await login()
    expect(first.statusCode).toBe(200)
    expect(sessionCookieOf(first)).toBeUndefined()
    const { mfaTicket } = first.json().data
    expect(mfaTicket).toEqual(expect.any(String))

    const code = totpCode(secret, step(1))
    const second = await post('/auth/login/mfa', { ticket: mfaTicket, code }, null)
    expect(second.statusCode).toBe(200)
    expect(sessionCookieOf(second)).toBeDefined()
    expect(second.json().data.user.username).toBe('alice')

    // The ticket and the code are both spent.
    const replay = await post('/auth/login/mfa', { ticket: mfaTicket, code }, null)
    expect(replay.statusCode).toBe(401)
    const fresh = (await login()).json().data.mfaTicket
    const reused = await post('/auth/login/mfa', { ticket: fresh, code }, null)
    expect(reused.json().code).toBe('INVALID_MFA_CODE')
  })

  it('takes each recovery code once', async () => {
    const { codes } = await enable()

    const ticket = (await login()).json().data.mfaTicket
    const recovered = await post('/auth/login/mfa', { ticket, code: codes[0] }, null)
    expect(recovered.statusCode).toBe(200)

    const next = (await login()).json().data.mfaTicket
    const reused = await post('/auth/login/mfa', { ticket: next, code: codes[0] }, null)
    expect(reused.statusCode).toBe(401)
    expect(reused.json().code).toBe('INVALID_MFA_CODE')
  })

  it('refuses unknown tickets', async () => {
    const response = await post('/auth/login/mfa', { ticket: 'x'.repeat(43), code: '123456' }, null)
    expect(response.statusCode).toBe(401)
    expect(response.json().code).toBe('INVALID_MFA_TICKET')
  })

  it('still needs the password first', async () => {
    await enable()
    expect((await login('wrong-password')).json().code).toBe('INVALID_CREDENTIALS')
  })
})

describe('managing 2FA', () => {
  it('signs out other sessions when turned on', async () => {
    const other = sessionCookieOf(await login()) as string
    await enable()

    const me = (session: string) =>
      app.inject({
        method: 'GET',
        url: '/api/v1/users/@me',
        headers: { cookie: `${SESSION_COOKIE}=${session}` },
      })
    expect((await me(other)).statusCode).toBe(401)
    expect((await me(cookie)).statusCode).toBe(200)
  })

  it('counts wrong codes, so they can not be guessed to turn 2FA off', async () => {
    await enable()
    for (let i = 0; i < MAX_FAILED_LOGINS; i += 1) {
      await post('/users/@me/mfa/disable', { password: 'password123', code: '000000' })
    }

    const locked = await post('/users/@me/mfa/disable', {
      password: 'password123',
      code: '000000',
    })
    expect(locked.statusCode).toBe(429)
    expect(locked.json().code).toBe('LOGIN_LOCKED')
  })

  it('turns off with the password and a code', async () => {
    const { codes } = await enable()

    const withoutCode = await post('/users/@me/mfa/disable', {
      password: 'password123',
      code: '000000',
    })
    expect(withoutCode.json().code).toBe('INVALID_MFA_CODE')
    const disabled = await post('/users/@me/mfa/disable', {
      password: 'password123',
      code: codes[1],
    })
    expect(disabled.statusCode).toBe(200)

    const signedIn = await login()
    expect(sessionCookieOf(signedIn)).toBeDefined()
  })

  it('makes new recovery codes, and the old ones stop working', async () => {
    const { secret, codes } = await enable()

    const renewed = await post('/users/@me/mfa/recovery-codes', {
      password: 'password123',
      code: totpCode(secret, step(1)),
    })
    expect(renewed.statusCode).toBe(200)
    expect(renewed.json().data.recoveryCodes).not.toContain(codes[0])

    const ticket = (await login()).json().data.mfaTicket
    const old = await post('/auth/login/mfa', { ticket, code: codes[0] }, null)
    expect(old.statusCode).toBe(401)
  })
})

describe('deleting an account with 2FA', () => {
  it('takes a code as well as the password', async () => {
    // The first account runs the instance and can't go; a second one can.
    cookie = (await registerUser(app, { username: 'bob', email: 'bob@example.com' }))
      .cookie as string
    const { secret } = await enable()
    const remove = (payload: object) =>
      app.inject({
        method: 'DELETE',
        url: '/api/v1/users/@me',
        headers: { origin: WEB_ORIGIN, cookie: `${SESSION_COOKIE}=${cookie}` },
        payload,
      })

    const missing = await remove({ password: 'password123' })
    expect(missing.json().code).toBe('MFA_CODE_REQUIRED')
    const wrong = await remove({ password: 'password123', code: '000000' })
    expect(wrong.json().code).toBe('INVALID_MFA_CODE')

    const done = await remove({ password: 'password123', code: totpCode(secret, step(1)) })
    expect(done.statusCode).toBe(204)
  })
})
