import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { registerUser, SESSION_COOKIE, WEB_ORIGIN } from '../../../test/auth-helpers'
import { createOutbox } from '../../../test/outbox'
import { createTestApp, resetState } from '../../../test/test-app'

const outbox = createOutbox()
const { app, db, redis, close } = createTestApp({
  env: {
    RATE_LIMIT: 'off',
    REQUIRE_VERIFIED_EMAIL: 'on',
    INITIAL_ADMIN_EMAIL: 'admin@example.com',
  },
  mailer: outbox.mailer,
})

const call = (
  cookie: string | null,
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  payload?: object,
) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { origin: WEB_ORIGIN, ...(cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {}) },
    ...(payload ? { payload } : {}),
  })

const verify = async (cookie: string, email: string) => {
  const mail = await outbox.waitForMessage(email, /подтвердите|confirm/i)
  const token = outbox.tokenFrom(mail, '/verify-email')
  expect((await call(cookie, 'POST', '/auth/verify-email', { token })).statusCode).toBe(200)
}

beforeEach(async () => {
  await resetState(db, redis)
  outbox.clear()
})

afterAll(async () => {
  await close()
})

describe('requiring a confirmed email', () => {
  it('keeps an unconfirmed account from reaching anyone, until the email is confirmed', async () => {
    const alice = (await registerUser(app, { username: 'alice', email: 'alice@example.com' }))
      .cookie as string
    const bob = (await registerUser(app, { username: 'bob', email: 'bob@example.com' }))
      .cookie as string
    await verify(bob, 'bob@example.com')

    const guild = await call(alice, 'POST', '/guilds', { name: 'Рано', locale: 'ru' })
    expect(guild.statusCode).toBe(403)
    expect(guild.json().code).toBe('EMAIL_NOT_VERIFIED')
    const friend = await call(alice, 'POST', '/users/@me/relationships', { username: 'bob' })
    expect(friend.json().code).toBe('EMAIL_NOT_VERIFIED')
    const bobId = (await call(bob, 'GET', '/users/@me')).json().data.user.id as string
    const dm = await call(alice, 'POST', '/users/@me/channels', { recipientIds: [bobId] })
    expect(dm.json().code).toBe('EMAIL_NOT_VERIFIED')
    // Reading and the account itself still work.
    expect((await call(alice, 'GET', '/users/@me')).statusCode).toBe(200)

    await verify(alice, 'alice@example.com')
    expect((await call(alice, 'POST', '/guilds', { name: 'Пора', locale: 'ru' })).statusCode).toBe(
      201,
    )
  })

  it('is an instance setting admins can turn off, shown in the public instance info', async () => {
    const admin = (await registerUser(app, { username: 'admin', email: 'admin@example.com' }))
      .cookie as string
    const carol = (await registerUser(app, { username: 'carol', email: 'carol@example.com' }))
      .cookie as string
    expect((await call(null, 'GET', '/instance')).json().data.instance.requireVerifiedEmail).toBe(
      true,
    )

    const changed = await call(admin, 'PATCH', '/admin/settings', { requireVerifiedEmail: false })
    expect(changed.statusCode).toBe(200)
    expect(changed.json().data.settings.requireVerifiedEmail).toBe(false)

    expect(
      (await call(carol, 'POST', '/guilds', { name: 'Без письма', locale: 'ru' })).statusCode,
    ).toBe(201)
    expect((await call(null, 'GET', '/instance')).json().data.instance.requireVerifiedEmail).toBe(
      false,
    )
  })
})
