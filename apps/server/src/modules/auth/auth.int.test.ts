import { argon2Sync, randomBytes } from 'node:crypto'

import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import {
  SESSION_COOKIE,
  WEB_ORIGIN,
  registerUser,
  sessionCookieOf,
} from '../../../test/auth-helpers'
import { createTestApp, resetState } from '../../../test/test-app'
import { sessions, users } from '../../db/schema'

const { app, db, redis, close } = createTestApp()

const me = (headers: Record<string, string>) =>
  app.inject({ method: 'GET', url: '/api/v1/users/@me', headers })

const withCookie = (token: string) => ({ cookie: `${SESSION_COOKIE}=${token}` })

beforeEach(async () => {
  await resetState(db, redis)
})

afterAll(async () => {
  await close()
})

describe('POST /api/v1/auth/register', () => {
  it('creates the user, starts a cookie session and returns the current user', async () => {
    const { response, cookie } = await registerUser(app, { username: 'Alice' })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toEqual({
      success: true,
      data: {
        user: {
          id: expect.stringMatching(/^\d+$/),
          username: 'alice',
          displayName: null,
          avatarUrl: null,
          email: 'alice@example.com',
          emailVerified: false,
          dmPolicy: 'servers',
          bio: null,
          mfaEnabled: false,
          isAdmin: true,
          createdAt: expect.any(String),
          bannerUrl: null,
          accentColor: null,
        },
      },
    })

    const setCookie = response.cookies.find((c) => c.name === SESSION_COOKIE)
    expect(cookie).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(setCookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' })
  })

  it('stores an argon2id hash, never the password', async () => {
    await registerUser(app, { password: 'password123' })

    const [row] = await db.select().from(users)
    expect(row?.passwordHash).toMatch(/^\$argon2id\$/)
    expect(row?.passwordHash).not.toContain('password123')
  })

  it('stores only the hash of the session token', async () => {
    const { cookie } = await registerUser(app)

    const [row] = await db.select().from(sessions)
    expect(row?.tokenHash).toMatch(/^[a-f0-9]{64}$/)
    expect(row?.tokenHash).not.toBe(cookie)
  })

  it('returns the token in the body instead of a cookie in bearer mode', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'x-auth-mode': 'bearer' },
      payload: { username: 'bob', email: 'bob@example.com', password: 'password123' },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json().data.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(sessionCookieOf(response)).toBeUndefined()
  })

  it('rejects a taken username regardless of case', async () => {
    await registerUser(app, { username: 'alice' })
    const { response } = await registerUser(app, { username: 'ALICE', email: 'other@example.com' })

    expect(response.statusCode).toBe(409)
    expect(response.json()).toMatchObject({ success: false, code: 'USERNAME_TAKEN' })
  })

  it('rejects a taken email regardless of case', async () => {
    await registerUser(app, { email: 'alice@example.com' })
    const { response } = await registerUser(app, { username: 'bob', email: 'Alice@Example.com' })

    expect(response.statusCode).toBe(409)
    expect(response.json()).toMatchObject({ success: false, code: 'EMAIL_TAKEN' })
  })

  it('validates the body', async () => {
    const { response } = await registerUser(app, { username: 'a', password: 'short' })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ code: 'VALIDATION_FAILED' })
  })
})

describe('POST /api/v1/auth/login', () => {
  const login = (payload: { login: string; password: string }) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: WEB_ORIGIN },
      payload,
    })

  beforeEach(async () => {
    await registerUser(app, { username: 'alice', email: 'alice@example.com' })
  })

  it.each(['alice', 'ALICE', 'alice@example.com', 'Alice@Example.com'])(
    'signs in with %j',
    async (identifier) => {
      const response = await login({ login: identifier, password: 'password123' })

      expect(response.statusCode).toBe(200)
      expect(response.json().data.user.username).toBe('alice')
      expect(sessionCookieOf(response)).toBeDefined()
    },
  )

  it('rejects a wrong password with a generic error', async () => {
    const response = await login({ login: 'alice', password: 'wrong-password' })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({ code: 'INVALID_CREDENTIALS' })
    expect(sessionCookieOf(response)).toBeUndefined()
  })

  it('gives the same answer for unknown users', async () => {
    const response = await login({ login: 'nobody', password: 'password123' })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({ code: 'INVALID_CREDENTIALS' })
  })

  it('upgrades a hash made with outdated parameters on successful login', async () => {
    const salt = randomBytes(16)
    const weak = argon2Sync('argon2id', {
      message: 'password123',
      nonce: salt,
      memory: 4096,
      passes: 1,
      parallelism: 1,
      tagLength: 32,
    })
    const b64 = (buffer: Buffer) => buffer.toString('base64').replace(/=+$/, '')
    const weakHash = `$argon2id$v=19$m=4096,t=1,p=1$${b64(salt)}$${b64(weak)}`
    await db.update(users).set({ passwordHash: weakHash })

    const response = await login({ login: 'alice', password: 'password123' })

    expect(response.statusCode).toBe(200)
    const [row] = await db.select().from(users)
    expect(row?.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)
  })

  it('creates a separate session per login', async () => {
    await login({ login: 'alice', password: 'password123' })
    await login({ login: 'alice', password: 'password123' })

    const rows = await db.select().from(sessions)
    expect(rows).toHaveLength(3)
  })
})

describe('GET /api/v1/users/@me', () => {
  it('returns the user for a cookie session', async () => {
    const { cookie } = await registerUser(app)
    const response = await me(withCookie(cookie as string))

    expect(response.statusCode).toBe(200)
    expect(response.json().data.user.username).toBe('alice')
  })

  it('returns the user for a bearer token', async () => {
    const { cookie } = await registerUser(app)
    const response = await me({ authorization: `Bearer ${cookie}` })

    expect(response.statusCode).toBe(200)
  })

  it('requires authentication', async () => {
    const response = await me({})

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it.each([
    withCookie('garbage'),
    { authorization: 'Bearer garbage' },
    { authorization: 'Basic x' },
  ])('rejects invalid credentials %j', async (headers) => {
    const response = await me(headers)
    expect(response.statusCode).toBe(401)
  })

  it('rejects expired sessions', async () => {
    const { cookie } = await registerUser(app)
    await db.update(sessions).set({ expiresAt: sql`now() - interval '1 minute'` })

    const response = await me(withCookie(cookie as string))
    expect(response.statusCode).toBe(401)
  })

  it('extends the session expiry on use', async () => {
    const { cookie } = await registerUser(app)
    await db.update(sessions).set({
      lastUsedAt: sql`now() - interval '2 days'`,
      expiresAt: sql`now() + interval '1 day'`,
    })

    await me(withCookie(cookie as string))

    const [row] = await db.select().from(sessions)
    const daysLeft = ((row?.expiresAt.getTime() ?? 0) - Date.now()) / 86_400_000
    expect(daysLeft).toBeGreaterThan(29)
  })
})

describe('POST /api/v1/auth/logout', () => {
  it('ends the current session and clears the cookie', async () => {
    const { cookie } = await registerUser(app)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { ...withCookie(cookie as string), origin: WEB_ORIGIN },
    })

    expect(response.statusCode).toBe(204)
    expect(response.cookies.find((c) => c.name === SESSION_COOKIE)?.value).toBe('')
    expect(await db.select().from(sessions)).toHaveLength(0)
    expect((await me(withCookie(cookie as string))).statusCode).toBe(401)
  })

  it('keeps other sessions of the same user', async () => {
    const { cookie } = await registerUser(app)
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: WEB_ORIGIN },
      payload: { login: 'alice', password: 'password123' },
    })

    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { ...withCookie(cookie as string), origin: WEB_ORIGIN },
    })

    expect(await db.select().from(sessions)).toHaveLength(1)
  })

  it('requires authentication', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { origin: WEB_ORIGIN },
    })
    expect(response.statusCode).toBe(401)
  })
})

describe('CSRF protection', () => {
  const logout = (headers: Record<string, string>) =>
    app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers })

  it('rejects cookie-authenticated writes from a foreign origin', async () => {
    const { cookie } = await registerUser(app)
    const response = await logout({
      ...withCookie(cookie as string),
      origin: 'https://evil.example',
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toMatchObject({ code: 'CSRF_ORIGIN_MISMATCH' })
    expect(await db.select().from(sessions)).toHaveLength(1)
  })

  it('rejects cookie-authenticated writes without an Origin header', async () => {
    const { cookie } = await registerUser(app)
    const response = await logout(withCookie(cookie as string))

    expect(response.statusCode).toBe(403)
  })

  it('rejects login attempts from a foreign origin', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { origin: 'https://evil.example' },
      payload: { username: 'eve', email: 'eve@example.com', password: 'password123' },
    })

    expect(response.statusCode).toBe(403)
    expect(await db.select().from(users).where(eq(users.username, 'eve'))).toHaveLength(0)
  })

  it('allows bearer-authenticated writes without an Origin header', async () => {
    const { cookie } = await registerUser(app)
    const response = await logout({ authorization: `Bearer ${cookie}` })

    expect(response.statusCode).toBe(204)
  })

  it('does not check safe methods', async () => {
    const { cookie } = await registerUser(app)
    const response = await me({ ...withCookie(cookie as string), origin: 'https://evil.example' })

    expect(response.statusCode).toBe(200)
  })
})
