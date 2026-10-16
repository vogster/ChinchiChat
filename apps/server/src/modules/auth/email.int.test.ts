import { sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { registerUser, SESSION_COOKIE, WEB_ORIGIN } from '../../../test/auth-helpers'
import { createOutbox } from '../../../test/outbox'
import { createTestApp, resetState } from '../../../test/test-app'
import { emailTokens } from '../../db/schema'

const outbox = createOutbox()
const { app, db, redis, close } = createTestApp({
  env: { PUBLIC_URL: 'https://chat.example.com' },
  mailer: outbox.mailer,
})

const post = (url: string, payload?: object, headers: Record<string, string> = {}) =>
  app.inject({
    method: 'POST',
    url: `/api/v1${url}`,
    headers: { origin: WEB_ORIGIN, ...headers },
    ...(payload ? { payload } : {}),
  })

const cookieHeader = (token: string) => ({ cookie: `${SESSION_COOKIE}=${token}` })

const me = (token: string) =>
  app.inject({ method: 'GET', url: '/api/v1/users/@me', headers: cookieHeader(token) })

const login = (password: string) => post('/auth/login', { login: 'alice', password: password })

beforeEach(async () => {
  await resetState(db, redis)
  outbox.clear()
})

afterAll(async () => {
  await close()
})

describe('email verification', () => {
  it('sends a verification link to the address on registration', async () => {
    await registerUser(app)

    const message = await outbox.waitForMessage('alice@example.com', /подтвердите/i)
    expect(message.text).toContain('https://chat.example.com/verify-email#token=')
    expect(message.html).toContain('https://chat.example.com/verify-email#token=')
  })

  it('marks the email as verified with a valid token', async () => {
    const { cookie } = await registerUser(app)
    const token = outbox.tokenFrom(
      await outbox.waitForMessage('alice@example.com', /подтвердите/i),
      '/verify-email',
    )

    const response = await post('/auth/verify-email', { token })

    expect(response.statusCode).toBe(200)
    expect(response.json().data.user.emailVerified).toBe(true)
    expect((await me(cookie as string)).json().data.user.emailVerified).toBe(true)
  })

  it('accepts each token only once', async () => {
    await registerUser(app)
    const token = outbox.tokenFrom(
      await outbox.waitForMessage('alice@example.com', /подтвердите/i),
      '/verify-email',
    )

    await post('/auth/verify-email', { token })
    const second = await post('/auth/verify-email', { token })

    expect(second.statusCode).toBe(400)
    expect(second.json()).toMatchObject({ code: 'INVALID_TOKEN' })
  })

  it('rejects expired and unknown tokens', async () => {
    await registerUser(app)
    const token = outbox.tokenFrom(
      await outbox.waitForMessage('alice@example.com', /подтвердите/i),
      '/verify-email',
    )
    await db.update(emailTokens).set({ expiresAt: sql`now() - interval '1 second'` })

    expect((await post('/auth/verify-email', { token })).json()).toMatchObject({
      code: 'INVALID_TOKEN',
    })
    expect((await post('/auth/verify-email', { token: 'x'.repeat(43) })).statusCode).toBe(400)
  })

  it('resends the verification email to a signed-in user', async () => {
    const { cookie } = await registerUser(app)
    await outbox.waitForMessage('alice@example.com', /подтвердите/i)
    outbox.clear()

    const response = await post(
      '/auth/verify-email/resend',
      undefined,
      cookieHeader(cookie as string),
    )

    expect(response.statusCode).toBe(202)
    await outbox.waitForMessage('alice@example.com', /подтвердите/i)
  })

  it('refuses to resend once the email is verified', async () => {
    const { cookie } = await registerUser(app)
    const token = outbox.tokenFrom(
      await outbox.waitForMessage('alice@example.com', /подтвердите/i),
      '/verify-email',
    )
    await post('/auth/verify-email', { token })

    const response = await post(
      '/auth/verify-email/resend',
      undefined,
      cookieHeader(cookie as string),
    )

    expect(response.statusCode).toBe(409)
    expect(response.json()).toMatchObject({ code: 'EMAIL_ALREADY_VERIFIED' })
  })

  it('requires authentication to resend', async () => {
    expect((await post('/auth/verify-email/resend')).statusCode).toBe(401)
  })
})

describe('password reset', () => {
  const requestReset = async () => {
    const response = await post('/auth/password/forgot', { email: 'Alice@Example.com' })
    const message = await outbox.waitForMessage('alice@example.com', /сброс пароля/i)
    return { response, token: outbox.tokenFrom(message, '/reset-password') }
  }

  beforeEach(async () => {
    await registerUser(app, { password: 'old-password' })
    await outbox.waitForMessage('alice@example.com', /подтвердите/i)
  })

  it('accepts the request and emails a reset link', async () => {
    const { response, token } = await requestReset()

    expect(response.statusCode).toBe(202)
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('answers identically for unknown emails and sends nothing', async () => {
    const before = outbox.messages.length
    const response = await post('/auth/password/forgot', { email: 'nobody@example.com' })

    expect(response.statusCode).toBe(202)
    expect(response.json()).toEqual({ success: true, data: null })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(outbox.messages).toHaveLength(before)
  })

  it('replaces the password and verifies the email', async () => {
    const { token } = await requestReset()

    const response = await post('/auth/password/reset', { token, password: 'new-password' })

    expect(response.statusCode).toBe(200)
    expect((await login('old-password')).statusCode).toBe(401)
    const signedIn = await login('new-password')
    expect(signedIn.statusCode).toBe(200)
    expect(signedIn.json().data.user.emailVerified).toBe(true)
  })

  it("leaves other users' sessions alone", async () => {
    const { cookie: bobCookie } = await registerUser(app, {
      username: 'bob',
      email: 'bob@example.com',
    })
    const { token } = await requestReset()

    await post('/auth/password/reset', { token, password: 'new-password' })

    expect((await me(bobCookie as string)).statusCode).toBe(200)
  })

  it('revokes existing sessions of the user', async () => {
    const signedIn = await login('old-password')
    const cookie = signedIn.cookies.find((c) => c.name === SESSION_COOKIE)?.value as string
    const { token } = await requestReset()

    await post('/auth/password/reset', { token, password: 'new-password' })

    expect((await me(cookie)).statusCode).toBe(401)
  })

  it('drops older reset links once the password changes', async () => {
    const first = await requestReset()
    const second = await requestReset()
    await post('/auth/password/reset', { token: second.token, password: 'new-password' })

    const stale = await post('/auth/password/reset', {
      token: first.token,
      password: 'evil-password',
    })
    expect(stale.json()).toMatchObject({ code: 'INVALID_TOKEN' })

    const signedIn = await login('new-password')
    const cookie = signedIn.cookies.find((c) => c.name === SESSION_COOKIE)?.value as string
    const third = await requestReset()
    await post(
      '/auth/password/change',
      { currentPassword: 'new-password', newPassword: 'newer-password' },
      cookieHeader(cookie),
    )
    const afterChange = await post('/auth/password/reset', {
      token: third.token,
      password: 'x-password',
    })
    expect(afterChange.json()).toMatchObject({ code: 'INVALID_TOKEN' })
  })

  it('accepts each reset token only once', async () => {
    const { token } = await requestReset()

    await post('/auth/password/reset', { token, password: 'new-password' })
    const second = await post('/auth/password/reset', { token, password: 'another-password' })

    expect(second.statusCode).toBe(400)
    expect(second.json()).toMatchObject({ code: 'INVALID_TOKEN' })
  })

  it('does not accept a verification token as a reset token', async () => {
    outbox.clear()
    const { cookie } = await registerUser(app, { username: 'carol', email: 'carol@example.com' })
    expect(cookie).toBeDefined()
    const verifyToken = outbox.tokenFrom(
      await outbox.waitForMessage('carol@example.com', /подтвердите/i),
      '/verify-email',
    )

    const response = await post('/auth/password/reset', {
      token: verifyToken,
      password: 'new-password',
    })
    expect(response.json()).toMatchObject({ code: 'INVALID_TOKEN' })
  })

  it('validates the new password', async () => {
    const { token } = await requestReset()

    const response = await post('/auth/password/reset', { token, password: 'short' })
    expect(response.json()).toMatchObject({ code: 'VALIDATION_FAILED' })
  })
})

describe('the language of emails', () => {
  it('follows the language chosen at sign-up and later in the settings', async () => {
    const registered = await post('/auth/register', {
      username: 'bob',
      email: 'bob@example.com',
      password: 'password123',
      locale: 'en',
    })
    expect(registered.json().data.user.locale).toBe('en')
    const welcome = await outbox.waitForMessage('bob@example.com', /confirm your email/i)
    expect(welcome.text).toContain('Hi, bob!')

    const cookie = registered.cookies.find((c) => c.name === SESSION_COOKIE)?.value as string
    const changed = await app.inject({
      method: 'PATCH',
      url: '/api/v1/users/@me',
      headers: { origin: WEB_ORIGIN, ...cookieHeader(cookie) },
      payload: { locale: 'ru' },
    })
    expect(changed.json().data.user.locale).toBe('ru')
    await post('/auth/password/forgot', { email: 'bob@example.com' })
    await outbox.waitForMessage('bob@example.com', /сброс пароля/i)
  })

  it('is Russian when the client does not say', async () => {
    const { response } = await registerUser(app)
    expect(response.json().data.user.locale).toBe('ru')
  })
})
