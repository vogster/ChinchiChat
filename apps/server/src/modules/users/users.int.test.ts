import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { registerUser, SESSION_COOKIE, WEB_ORIGIN } from '../../../test/auth-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

const { app, db, redis, close } = createTestApp()

const updateProfile = (token: string | undefined, payload: object) =>
  app.inject({
    method: 'PATCH',
    url: '/api/v1/users/@me',
    headers: {
      origin: WEB_ORIGIN,
      ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}),
    },
    payload,
  })

beforeEach(async () => {
  await resetState(db, redis)
})

afterAll(async () => {
  await close()
})

describe('PATCH /api/v1/users/@me', () => {
  it('sets and trims the display name', async () => {
    const { cookie } = await registerUser(app)

    const response = await updateProfile(cookie, { displayName: '  Алиса 🌸 ' })

    expect(response.statusCode).toBe(200)
    expect(response.json().data.user).toMatchObject({ username: 'alice', displayName: 'Алиса 🌸' })
  })

  it('clears the display name with null', async () => {
    const { cookie } = await registerUser(app)
    await updateProfile(cookie, { displayName: 'Alice' })

    const response = await updateProfile(cookie, { displayName: null })

    expect(response.json().data.user.displayName).toBeNull()
  })

  it('sets who may send DMs, server mates by default', async () => {
    const { cookie } = await registerUser(app)
    await updateProfile(cookie, { displayName: 'Alice' })

    const response = await updateProfile(cookie, { dmPolicy: 'friends' })

    expect(response.json().data.user).toMatchObject({ displayName: 'Alice', dmPolicy: 'friends' })
    expect((await updateProfile(cookie, { dmPolicy: 'everyone' })).statusCode).toBe(400)
  })

  it('rejects invalid input and unknown fields', async () => {
    const { cookie } = await registerUser(app)

    expect((await updateProfile(cookie, { displayName: '' })).statusCode).toBe(400)
    expect((await updateProfile(cookie, {})).statusCode).toBe(400)
    expect((await updateProfile(cookie, { displayName: 'A', username: 'root' })).statusCode).toBe(
      400,
    )
  })

  it('requires authentication', async () => {
    expect((await updateProfile(undefined, { displayName: 'x' })).statusCode).toBe(401)
  })
})
