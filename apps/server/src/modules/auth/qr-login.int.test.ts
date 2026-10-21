import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { SESSION_COOKIE, WEB_ORIGIN } from '../../../test/auth-helpers'
import { signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'
import { users } from '../../db/schema'

import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, close } = createTestApp({ env: { RATE_LIMIT: 'off' } })

const KEY = 'B'.repeat(43) + '='
const APPROVER_KEY = 'C'.repeat(43) + '='
const NEW_DEVICE = { origin: WEB_ORIGIN, 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/130' }

let alice: TestActor

const create = (payload: object = {}, headers: Record<string, string> = NEW_DEVICE) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/qr', headers, payload })

const claim = (id: string, secret: string, headers: Record<string, string> = NEW_DEVICE) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/auth/qr/${id}/claim`,
    headers,
    payload: { secret },
  })

/** The number each new device shows, so approvals pick the right one unless a test says so. */
const shown = new Map<string, number>()

const approve = (id: string, by: TestActor, payload: object = {}) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/auth/qr/${id}/approve`,
    headers: by.headers,
    payload: { match: shown.get(id) ?? 10, ...payload },
  })

const ticket = async (payload: object = {}) => {
  const response = await create(payload)
  expect(response.statusCode).toBe(201)
  const created = response.json().data.ticket as {
    id: string
    secret: string
    code: string
    url: string
    match: number
  }
  shown.set(created.id, created.match)
  return created
}

beforeEach(async () => {
  await resetState(db, redis)
  alice = await signUp(app, { username: 'alice', email: 'alice@example.com' })
})

afterAll(async () => {
  await close()
})

describe('signing in with a QR code', () => {
  it('signs the new device in once an approved one says yes', async () => {
    const { id, secret, code, url } = await ticket({ publicKey: KEY })
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/)
    // The QR opens the approval on the instance's web address, with the key read optically.
    const scanned = new URL(url)
    expect(scanned.searchParams.get('qr')).toBe(id)
    expect(scanned.searchParams.get('qrKey')).toBe(KEY)

    // Before the yes, the new device keeps waiting.
    expect((await claim(id, secret)).json().data).toEqual({ state: 'pending' })

    // The approving device sees who asks, by the id from the QR or by the short code.
    const seen = await app.inject({
      method: 'GET',
      url: `/api/v1/auth/qr/${id}`,
      headers: alice.headers,
    })
    expect(seen.json().data.login).toMatchObject({
      id,
      userAgent: NEW_DEVICE['user-agent'],
      publicKey: KEY,
    })
    const byCode = await app.inject({
      method: 'GET',
      url: `/api/v1/auth/qr/code/${code.toLowerCase()}`,
      headers: alice.headers,
    })
    expect(byCode.json().data.login.id).toBe(id)

    expect(
      (await approve(id, alice, { sealed: 'c2VjcmV0', approverKey: APPROVER_KEY })).statusCode,
    ).toBe(204)

    const signedIn = await claim(id, secret)
    expect(signedIn.statusCode).toBe(200)
    expect(signedIn.json().data).toMatchObject({
      state: 'approved',
      user: { id: alice.id, username: 'alice' },
      sealed: 'c2VjcmV0',
      approverKey: APPROVER_KEY,
    })
    const cookie = signedIn.cookies.find((c) => c.name === SESSION_COOKIE)?.value as string
    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/users/@me',
      headers: { cookie: `${SESSION_COOKIE}=${cookie}` },
    })
    expect(me.json().data.user.id).toBe(alice.id)

    // Used once: the ticket is gone.
    expect((await claim(id, secret)).statusCode).toBe(404)
  })

  it('hands a token instead of a cookie to native clients', async () => {
    const { id, secret } = await ticket()
    await approve(id, alice)

    const signedIn = await claim(id, secret, { ...NEW_DEVICE, 'x-auth-mode': 'bearer' })
    const token = signedIn.json().data.token as string
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(signedIn.cookies.find((c) => c.name === SESSION_COOKIE)).toBeUndefined()
    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/users/@me',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(me.json().data.user.id).toBe(alice.id)
  })

  it('gives nothing without the secret, to anyone who only knows the id', async () => {
    const { id } = await ticket()
    await approve(id, alice)

    const response = await claim(id, 'x'.repeat(43))
    expect(response.statusCode).toBe(404)
    expect(response.json().code).toBe('UNKNOWN_QR_LOGIN')
  })

  it('is approved once, and only by someone signed in', async () => {
    const { id } = await ticket()

    const anonymous = await app.inject({
      method: 'POST',
      url: `/api/v1/auth/qr/${id}/approve`,
      headers: { origin: WEB_ORIGIN },
      payload: { match: 10 },
    })
    expect(anonymous.statusCode).toBe(401)
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/auth/qr/${id}`,
          headers: { origin: WEB_ORIGIN },
        })
      ).statusCode,
    ).toBe(401)

    expect((await approve(id, alice)).statusCode).toBe(204)
    const bob = await signUp(app, { username: 'bob', email: 'bob@example.com' })
    const again = await approve(id, bob)
    expect(again.statusCode).toBe(409)
    expect(again.json().code).toBe('QR_LOGIN_USED')
  })

  it('expires: a ticket gone from storage is unknown', async () => {
    const { id, secret, code } = await ticket()
    await redis.flushdb()

    expect((await claim(id, secret)).statusCode).toBe(404)
    expect((await approve(id, alice)).statusCode).toBe(404)
    const byCode = await app.inject({
      method: 'GET',
      url: `/api/v1/auth/qr/code/${code}`,
      headers: alice.headers,
    })
    expect(byCode.statusCode).toBe(404)
  })

  it('does not sign in to an account suspended in the meantime', async () => {
    const { id, secret } = await ticket()
    await approve(id, alice)
    await db.update(users).set({ suspendedAt: new Date() }).where(eq(users.id, alice.id))

    const response = await claim(id, secret)
    expect(response.statusCode).toBe(403)
    expect(response.json().code).toBe('ACCOUNT_SUSPENDED')
  })

  it('asks the approver to pick the number the new device shows', async () => {
    const { id, match } = await ticket()
    expect(match).toBeGreaterThanOrEqual(10)
    expect(match).toBeLessThanOrEqual(99)

    const seen = await app.inject({
      method: 'GET',
      url: `/api/v1/auth/qr/${id}`,
      headers: alice.headers,
    })
    const choices = seen.json().data.login.choices as number[]
    expect(choices).toHaveLength(3)
    expect(new Set(choices).size).toBe(3)
    expect(choices).toContain(match)
    // The same choices every time it is looked at, so the order gives nothing away on refresh.
    const again = await app.inject({
      method: 'GET',
      url: `/api/v1/auth/qr/${id}`,
      headers: alice.headers,
    })
    expect(again.json().data.login.choices).toEqual(choices)
  })

  it('burns the sign-in when the wrong number is picked: no second guess', async () => {
    const { id, secret, match } = await ticket()

    const wrong = await approve(id, alice, { match: match === 99 ? 98 : match + 1 })
    expect(wrong.statusCode).toBe(403)
    expect(wrong.json().code).toBe('QR_LOGIN_MISMATCH')

    expect((await approve(id, alice, { match })).statusCode).toBe(404)
    expect((await claim(id, secret)).statusCode).toBe(404)
  })

  it('wants a number to approve', async () => {
    const { id } = await ticket()

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/auth/qr/${id}/approve`,
      headers: alice.headers,
      payload: {},
    })
    expect(response.statusCode).toBe(400)
  })

  it('rejects a malformed code or key', async () => {
    expect((await create({ publicKey: 'AAAA' })).statusCode).toBe(400)
    const bad = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/qr/code/NOT-ACODE1',
      headers: alice.headers,
    })
    expect(bad.statusCode).toBe(400)
  })
})
