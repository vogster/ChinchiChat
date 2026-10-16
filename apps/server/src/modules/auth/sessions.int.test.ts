import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { registerUser, SESSION_COOKIE, WEB_ORIGIN } from '../../../test/auth-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

const { app, db, redis, close } = createTestApp()

const asUser = (token: string, extra: Record<string, string> = {}) => ({
  cookie: `${SESSION_COOKIE}=${token}`,
  origin: WEB_ORIGIN,
  ...extra,
})

const loginAgain = async (userAgent: string): Promise<string> => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { origin: WEB_ORIGIN, 'user-agent': userAgent },
    payload: { login: 'alice', password: 'password123' },
  })
  return response.cookies.find((c) => c.name === SESSION_COOKIE)?.value as string
}

const listSessions = (token: string) =>
  app.inject({ method: 'GET', url: '/api/v1/auth/sessions', headers: asUser(token) })

const me = (token: string) =>
  app.inject({ method: 'GET', url: '/api/v1/users/@me', headers: asUser(token) })

beforeEach(async () => {
  await resetState(db, redis)
})

afterAll(async () => {
  await close()
})

describe('GET /api/v1/auth/sessions', () => {
  it("lists the user's sessions and marks the current one", async () => {
    const { cookie } = await registerUser(app)
    await loginAgain('Chinchi Desktop/1.0')

    const response = await listSessions(cookie as string)

    expect(response.statusCode).toBe(200)
    const list = response.json().data.sessions
    expect(list).toHaveLength(2)
    expect(list.filter((s: { current: boolean }) => s.current)).toHaveLength(1)
    expect(list).toContainEqual(
      expect.objectContaining({ userAgent: 'Chinchi Desktop/1.0', current: false }),
    )
    expect(list[0]).not.toHaveProperty('tokenHash')
  })

  it("does not show other users' sessions", async () => {
    const { cookie } = await registerUser(app)
    await registerUser(app, { username: 'bob', email: 'bob@example.com' })

    const response = await listSessions(cookie as string)
    expect(response.json().data.sessions).toHaveLength(1)
  })

  it('requires authentication', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/auth/sessions' })
    expect(response.statusCode).toBe(401)
  })
})

describe('DELETE /api/v1/auth/sessions/:id', () => {
  it('revokes another session of the same user', async () => {
    const { cookie } = await registerUser(app)
    const other = await loginAgain('Phone')
    const list = (await listSessions(cookie as string)).json().data.sessions
    const target = list.find((s: { current: boolean }) => !s.current)

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/auth/sessions/${target.id}`,
      headers: asUser(cookie as string),
    })

    expect(response.statusCode).toBe(204)
    expect((await me(other)).statusCode).toBe(401)
    expect((await me(cookie as string)).statusCode).toBe(200)
  })

  it("cannot revoke someone else's session", async () => {
    const { cookie } = await registerUser(app)
    const { cookie: bobCookie } = await registerUser(app, {
      username: 'bob',
      email: 'bob@example.com',
    })
    const bobSession = (await listSessions(bobCookie as string)).json().data.sessions[0]

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/auth/sessions/${bobSession.id}`,
      headers: asUser(cookie as string),
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ code: 'SESSION_NOT_FOUND' })
    expect((await me(bobCookie as string)).statusCode).toBe(200)
  })

  it('validates the id', async () => {
    const { cookie } = await registerUser(app)
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/auth/sessions/not-a-snowflake',
      headers: asUser(cookie as string),
    })
    expect(response.statusCode).toBe(400)
  })
})

describe('DELETE /api/v1/auth/sessions', () => {
  it('signs out everywhere except the current session', async () => {
    const { cookie } = await registerUser(app)
    const phone = await loginAgain('Phone')
    const laptop = await loginAgain('Laptop')

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/auth/sessions',
      headers: asUser(cookie as string),
    })

    expect(response.statusCode).toBe(204)
    expect((await me(phone)).statusCode).toBe(401)
    expect((await me(laptop)).statusCode).toBe(401)
    expect((await me(cookie as string)).statusCode).toBe(200)
  })
})
