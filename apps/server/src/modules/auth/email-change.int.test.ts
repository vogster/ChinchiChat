import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { registerUser, SESSION_COOKIE, WEB_ORIGIN } from '../../../test/auth-helpers'
import { createOutbox } from '../../../test/outbox'
import { createTestApp, resetState } from '../../../test/test-app'
import { totpCode } from './totp'

const outbox = createOutbox()
const { app, db, redis, close } = createTestApp({
  env: { PUBLIC_URL: 'https://chat.example.com', RATE_LIMIT: 'off' },
  mailer: outbox.mailer,
})

let cookie: string

const post = (url: string, payload: object, session: string | null = cookie) =>
  app.inject({
    method: 'POST',
    url: `/api/v1${url}`,
    headers: { origin: WEB_ORIGIN, ...(session ? { cookie: `${SESSION_COOKIE}=${session}` } : {}) },
    payload,
  })

const me = async () =>
  (
    await app.inject({
      method: 'GET',
      url: '/api/v1/users/@me',
      headers: { cookie: `${SESSION_COOKIE}=${cookie}` },
    })
  ).json().data.user

const change = (email: string, extra: object = {}) =>
  post('/users/@me/email', { email, password: 'password123', ...extra })

/** The link from the email sent to the new address. */
const linkTo = async (address: string) =>
  outbox.tokenFrom(await outbox.waitForMessage(address, /новый email|new email/i), '/confirm-email')

beforeEach(async () => {
  await resetState(db, redis)
  outbox.clear()
  cookie = (await registerUser(app)).cookie as string
})

afterAll(async () => {
  await close()
})

describe('changing the email', () => {
  it('moves the account to the new address once the link from it is followed', async () => {
    const response = await change('New@Example.com')
    expect(response.statusCode).toBe(202)
    // Nothing changes until the new address confirms.
    expect((await me()).email).toBe('alice@example.com')

    const token = await linkTo('new@example.com')
    const confirmed = await post('/auth/email/confirm', { token }, null)

    expect(confirmed.statusCode).toBe(200)
    expect(confirmed.json().data.user).toMatchObject({
      email: 'new@example.com',
      emailVerified: true,
    })
    expect(await me()).toMatchObject({ email: 'new@example.com', emailVerified: true })
    // The old address is told, in case it wasn't its owner who did it.
    const notice = await outbox.waitForMessage('alice@example.com', /email изменён/i)
    expect(notice.text).toContain('n***@example.com')
    // Signing in works with the new address.
    const login = await post(
      '/auth/login',
      { login: 'new@example.com', password: 'password123' },
      null,
    )
    expect(login.statusCode).toBe(200)
  })

  it('takes each link once, and only the newest one', async () => {
    await change('first@example.com')
    const first = await linkTo('first@example.com')
    await change('second@example.com')
    const second = await linkTo('second@example.com')

    expect((await post('/auth/email/confirm', { token: first }, null)).json().code).toBe(
      'INVALID_TOKEN',
    )
    expect((await post('/auth/email/confirm', { token: second }, null)).statusCode).toBe(200)
    expect((await post('/auth/email/confirm', { token: second }, null)).json().code).toBe(
      'INVALID_TOKEN',
    )
  })

  it('needs the password', async () => {
    const response = await change('new@example.com', { password: 'wrong-password' })
    expect(response.statusCode).toBe(400)
    expect(response.json().code).toBe('INVALID_CURRENT_PASSWORD')
    expect(outbox.messages.some((m) => m.to === 'new@example.com')).toBe(false)
  })

  it('needs a code too when two-factor sign-in is on', async () => {
    const setup = (await post('/users/@me/mfa/totp/setup', { password: 'password123' })).json().data
    const step = Math.floor(Date.now() / 30_000)
    await post('/users/@me/mfa/totp/enable', { code: totpCode(setup.secret, step) })

    expect((await change('new@example.com')).json().code).toBe('MFA_CODE_REQUIRED')
    expect((await change('new@example.com', { code: '000000' })).json().code).toBe(
      'INVALID_MFA_CODE',
    )
    const ok = await change('new@example.com', { code: totpCode(setup.secret, step + 1) })
    expect(ok.statusCode).toBe(202)
  })

  it('does not tell whether the new address is taken', async () => {
    await registerUser(app, { username: 'bob', email: 'bob@example.com' })
    outbox.clear()

    const response = await change('bob@example.com')

    expect(response.statusCode).toBe(202)
    // Bob gets no link to someone else's account.
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(outbox.messages).toEqual([])
  })

  it('fails the link if the address was taken in the meantime', async () => {
    await change('new@example.com')
    const token = await linkTo('new@example.com')
    await registerUser(app, { username: 'bob', email: 'new@example.com' })

    const response = await post('/auth/email/confirm', { token }, null)

    expect(response.statusCode).toBe(409)
    expect(response.json().code).toBe('EMAIL_TAKEN')
    expect((await me()).email).toBe('alice@example.com')
  })

  it('refuses the address the account already has', async () => {
    const response = await change('ALICE@example.com')
    expect(response.statusCode).toBe(400)
    expect(response.json().code).toBe('SAME_EMAIL')
  })

  it('needs someone signed in', async () => {
    const response = await post('/users/@me/email', { email: 'x@y.co', password: 'p' }, null)
    expect(response.statusCode).toBe(401)
  })
})
