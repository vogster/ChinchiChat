import { sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { registerUser, SESSION_COOKIE, WEB_ORIGIN } from '../../../test/auth-helpers'
import { createOutbox } from '../../../test/outbox'
import { createTestApp, resetState } from '../../../test/test-app'

const outbox = createOutbox()
// Registration is closed from the start: only the designated admin may sign up.
const env = {
  RATE_LIMIT: 'off',
  REGISTRATION_MODE: 'closed',
  INITIAL_ADMIN_EMAIL: 'Boss@Example.com',
}
const { app, db, redis, close } = createTestApp({ env, mailer: outbox.mailer })
// The same instance without SMTP: the first admin's link can only be read from the log.
const firstAdminLinks = vi.fn<(link: string) => void>()
const withoutSmtp = createTestApp({ env, reportFirstAdminLink: firstAdminLinks })

const session = (cookie: string | undefined) => ({
  cookie: `${SESSION_COOKIE}=${cookie ?? ''}`,
  origin: WEB_ORIGIN,
})

const isAdmin = async (cookie: string | undefined) =>
  (await app.inject({ method: 'GET', url: '/api/v1/users/@me', headers: session(cookie) })).json()
    .data.user.isAdmin as boolean

/** Follows the link in the confirmation email, as the owner of the mailbox. */
const confirm = async (cookie: string | undefined, email: string) => {
  const token = outbox.tokenFrom(
    await outbox.waitForMessage(email, /подтвердите|confirm/i),
    '/verify-email',
  )
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/verify-email',
    headers: session(cookie),
    payload: { token },
  })
  expect(response.statusCode).toBe(200)
  return response
}

beforeEach(async () => {
  await resetState(db, redis)
  outbox.clear()
  firstAdminLinks.mockClear()
})

afterAll(async () => {
  await close()
  await withoutSmtp.close()
})

describe('a designated first admin', () => {
  it('may register on a closed instance, and runs it once the email is confirmed', async () => {
    const stranger = await registerUser(app, { username: 'eve', email: 'eve@example.com' })
    expect(stranger.response.json().code).toBe('REGISTRATION_CLOSED')

    const boss = await registerUser(app, { username: 'boss', email: 'boss@example.com' })
    expect(boss.response.statusCode).toBe(201)
    // Knowing the address is not owning it: no admin until the mailbox answers.
    expect(boss.response.json().data.user.isAdmin).toBe(false)

    const confirmed = await confirm(boss.cookie, 'boss@example.com')
    expect(confirmed.json().data.user.isAdmin).toBe(true)
    expect(await isAdmin(boss.cookie)).toBe(true)

    // Others still can't register.
    const again = await registerUser(app, { username: 'boss2', email: 'eve2@example.com' })
    expect(again.response.json().code).toBe('REGISTRATION_CLOSED')
  })

  it('is no shortcut once the instance has an admin', async () => {
    const boss = await registerUser(app, { username: 'boss', email: 'boss@example.com' })
    await confirm(boss.cookie, 'boss@example.com')
    // The designated address is free again (the account moved), but an admin exists.
    await db.execute(sql`update users set email = 'old-boss@example.com'`)
    await db.execute(
      sql`insert into instance_settings (id, registration_mode) values (1, 'open') on conflict (id) do update set registration_mode = 'open'`,
    )
    outbox.clear()

    const claim = await registerUser(app, { username: 'eve', email: 'boss@example.com' })
    expect(claim.response.statusCode).toBe(201)
    const confirmed = await confirm(claim.cookie, 'boss@example.com')
    expect(confirmed.json().data.user.isAdmin).toBe(false)
  })

  it('may also come by moving an account to the address, once the new address confirms', async () => {
    await db.execute(
      sql`insert into instance_settings (id, registration_mode) values (1, 'open') on conflict (id) do update set registration_mode = 'open'`,
    )
    const eve = await registerUser(app, { username: 'eve', email: 'eve@example.com' })
    const moved = await app.inject({
      method: 'POST',
      url: '/api/v1/users/@me/email',
      headers: session(eve.cookie),
      payload: { email: 'boss@example.com', password: 'password123' },
    })
    expect(moved.statusCode).toBe(202)
    expect(await isAdmin(eve.cookie)).toBe(false)

    const token = outbox.tokenFrom(
      await outbox.waitForMessage('boss@example.com', /новый email|new email/i),
      '/confirm-email',
    )
    const confirmed = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/email/confirm',
      headers: { origin: WEB_ORIGIN },
      payload: { token },
    })
    expect(confirmed.json().data.user.isAdmin).toBe(true)
  })

  it('without SMTP, gets the confirmation link in the log, and only them', async () => {
    const register = (username: string, email: string) =>
      registerUser(withoutSmtp.app, { username, email })

    expect((await register('boss', 'boss@example.com')).response.statusCode).toBe(201)

    expect(firstAdminLinks).toHaveBeenCalledOnce()
    const [link] = firstAdminLinks.mock.calls[0] as [string]
    expect(link).toMatch(/\/verify-email#token=[A-Za-z0-9_-]+$/)

    // Anyone else's link stays out of the log: one-time tokens don't belong there.
    await withoutSmtp.db.execute(
      sql`insert into instance_settings (id, registration_mode) values (1, 'open') on conflict (id) do update set registration_mode = 'open'`,
    )
    await register('eve', 'eve@example.com')
    expect(firstAdminLinks).toHaveBeenCalledOnce()
  })
})
