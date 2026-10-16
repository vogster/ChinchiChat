import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { SESSION_COOKIE, WEB_ORIGIN, registerUser } from '../../../test/auth-helpers'
import { createTestApp, resetState } from '../../../test/test-app'
import { users } from '../../db/schema'
import { totpCode } from './totp'

const SECRETS_KEY = 'ab'.repeat(32)
const { app, db, redis, close } = createTestApp({ env: { RATE_LIMIT: 'off', SECRETS_KEY } })

let cookie: string

const post = (url: string, payload: object, session: string | null = cookie) =>
  app.inject({
    method: 'POST',
    url: `/api/v1${url}`,
    headers: { origin: WEB_ORIGIN, ...(session ? { cookie: `${SESSION_COOKIE}=${session}` } : {}) },
    payload,
  })

const step = (offset = 0) => Math.floor(Date.now() / 30_000) + offset

const storedSecrets = async () => {
  const [row] = await db
    .select({ secret: users.totpSecret, pending: users.totpPendingSecret })
    .from(users)
    .where(eq(users.username, 'alice'))
  return row as { secret: string | null; pending: string | null }
}

beforeEach(async () => {
  await resetState(db, redis)
  cookie = (await registerUser(app)).cookie as string
})

afterAll(async () => {
  await close()
})

describe('TOTP secrets under SECRETS_KEY', () => {
  it('never land in the database in the clear, and still sign the user in', async () => {
    const setup = (await post('/users/@me/mfa/totp/setup', { password: 'password123' })).json()
      .data as { secret: string }
    expect((await storedSecrets()).pending).toMatch(/^enc1:/)
    expect((await storedSecrets()).pending).not.toContain(setup.secret)

    const enabled = await post('/users/@me/mfa/totp/enable', {
      code: totpCode(setup.secret, step()),
    })
    expect(enabled.statusCode).toBe(200)
    expect((await storedSecrets()).secret).toMatch(/^enc1:/)

    const first = await post('/auth/login', { login: 'alice', password: 'password123' }, null)
    const { mfaTicket } = first.json().data as { mfaTicket: string }
    const signedIn = await post(
      '/auth/login/mfa',
      { ticket: mfaTicket, code: totpCode(setup.secret, step(1)) },
      null,
    )
    expect(signedIn.statusCode).toBe(200)
  })

  it('seals a secret stored before the key existed once a code from it is accepted', async () => {
    // As an upgrade finds it: the base32 secret in the clear.
    const legacy = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
    await db.update(users).set({ totpSecret: legacy }).where(eq(users.username, 'alice'))

    const first = await post('/auth/login', { login: 'alice', password: 'password123' }, null)
    const { mfaTicket } = first.json().data as { mfaTicket: string }
    const signedIn = await post(
      '/auth/login/mfa',
      { ticket: mfaTicket, code: totpCode(legacy, step()) },
      null,
    )

    expect(signedIn.statusCode).toBe(200)
    const { secret } = await storedSecrets()
    expect(secret).toMatch(/^enc1:/)
    expect(secret).not.toContain(legacy)
  })
})
