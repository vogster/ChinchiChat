import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, events, close } = createTestApp({ env: { RATE_LIMIT: 'off' } })

let alice: TestActor
let bob: TestActor
let carol: TestActor

const call = (
  actor: TestActor,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  payload?: object,
) =>
  app.inject({
    method,
    url: `/api/v1/users/@me/relationships${url}`,
    headers: actor.headers,
    ...(payload ? { payload } : {}),
  })

const request = (from: TestActor, username: string) => call(from, 'POST', '', { username })

/** What `actor` sees: userId → type. */
const relationsOf = async (actor: TestActor) => {
  const response = await call(actor, 'GET', '')
  expect(response.statusCode).toBe(200)
  return Object.fromEntries(
    response
      .json()
      .data.relationships.map((r: { user: { id: string }; type: string }) => [r.user.id, r.type]),
  )
}

beforeEach(async () => {
  await resetState(db, redis)
  events.clear()
  alice = await signUp(app, { username: 'alice', email: 'alice@example.com' })
  bob = await signUp(app, { username: 'bob', email: 'bob@example.com' })
  carol = await signUp(app, { username: 'carol', email: 'carol@example.com' })
})

afterAll(async () => {
  await close()
})

describe('friend requests', () => {
  it('sends a request by username (any case) and lets the other side accept it', async () => {
    const sent = await request(alice, 'BoB')
    expect(sent.statusCode).toBe(200)
    expect(sent.json().data.relationship).toMatchObject({
      user: { id: bob.id },
      type: 'pending_out',
    })
    expect(await relationsOf(alice)).toEqual({ [bob.id]: 'pending_out' })
    expect(await relationsOf(bob)).toEqual({ [alice.id]: 'pending_in' })
    expect(events.published).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          topic: `user:${bob.id}`,
          type: 'RELATIONSHIP_ADD',
          data: expect.objectContaining({
            type: 'pending_in',
            user: expect.objectContaining({ id: alice.id }),
          }),
        }),
      ]),
    )

    const accepted = await call(bob, 'PUT', `/${alice.id}`, { type: 'friend' })
    expect(accepted.statusCode).toBe(200)
    expect(await relationsOf(alice)).toEqual({ [bob.id]: 'friend' })
    expect(await relationsOf(bob)).toEqual({ [alice.id]: 'friend' })
  })

  it('accepts when both ask each other', async () => {
    await request(alice, 'bob')
    await request(bob, 'alice')
    expect(await relationsOf(alice)).toEqual({ [bob.id]: 'friend' })
  })

  it('is idempotent for repeated requests', async () => {
    await request(alice, 'bob')
    events.clear()
    expect((await request(alice, 'bob')).statusCode).toBe(200)
    expect(events.published).toHaveLength(0)
  })

  it.each(['nobody', 'alice'])(
    'fails the same way for an unknown name or yourself (%s)',
    async (name) => {
      const response = await request(alice, name)
      expect(response.statusCode).toBe(400)
      expect(response.json().code).toBe('FRIEND_REQUEST_FAILED')
    },
  )

  it('declines, cancels and unfriends with DELETE, on both sides', async () => {
    await request(alice, 'bob')
    expect((await call(bob, 'DELETE', `/${alice.id}`)).statusCode).toBe(204)
    expect(await relationsOf(alice)).toEqual({})

    await request(alice, 'bob')
    await call(alice, 'DELETE', `/${bob.id}`)
    expect(await relationsOf(bob)).toEqual({})

    await request(alice, 'bob')
    await call(bob, 'PUT', `/${alice.id}`, { type: 'friend' })
    await call(alice, 'DELETE', `/${bob.id}`)
    expect(await relationsOf(alice)).toEqual({})
    expect(await relationsOf(bob)).toEqual({})
    expect(events.published.filter((e) => e.type === 'RELATIONSHIP_REMOVE').at(-1)).toMatchObject({
      topic: `user:${bob.id}`,
      data: { userId: alice.id },
    })
  })
})

describe('blocking', () => {
  it('ends a friendship, is invisible to the blocked user and stops their requests', async () => {
    await request(alice, 'bob')
    await call(bob, 'PUT', `/${alice.id}`, { type: 'friend' })

    expect((await call(alice, 'PUT', `/${bob.id}`, { type: 'blocked' })).statusCode).toBe(200)

    expect(await relationsOf(alice)).toEqual({ [bob.id]: 'blocked' })
    expect(await relationsOf(bob)).toEqual({})
    // Bob is not told he was blocked: the request fails like any other.
    const retry = await request(bob, 'alice')
    expect(retry.statusCode).toBe(400)
    expect(retry.json().code).toBe('FRIEND_REQUEST_FAILED')
  })

  it('needs an unblock before befriending again', async () => {
    await call(alice, 'PUT', `/${bob.id}`, { type: 'blocked' })
    const blocked = await request(alice, 'bob')
    expect(blocked.statusCode).toBe(400)
    expect(blocked.json().code).toBe('USER_BLOCKED')

    await call(alice, 'DELETE', `/${bob.id}`)
    expect((await request(alice, 'bob')).statusCode).toBe(200)
  })

  it('keeps their block when I block them back', async () => {
    await call(alice, 'PUT', `/${bob.id}`, { type: 'blocked' })
    await call(bob, 'PUT', `/${alice.id}`, { type: 'blocked' })
    await call(alice, 'DELETE', `/${bob.id}`)
    expect(await relationsOf(bob)).toEqual({ [alice.id]: 'blocked' })
  })

  it('answers 404 for users that do not exist', async () => {
    const response = await call(carol, 'PUT', '/123456789', { type: 'blocked' })
    expect(response.statusCode).toBe(404)
    expect(response.json().code).toBe('UNKNOWN_USER')
  })
})

describe('concurrent changes', () => {
  it('never lets an accept undo a block made at the same moment', async () => {
    for (let round = 0; round < 8; round += 1) {
      await call(bob, 'DELETE', `/${alice.id}`)
      await call(alice, 'DELETE', `/${bob.id}`)
      await request(bob, 'alice')

      await Promise.all([
        call(alice, 'PUT', `/${bob.id}`, { type: 'friend' }),
        call(bob, 'PUT', `/${alice.id}`, { type: 'blocked' }),
      ])

      expect((await relationsOf(bob))[alice.id]).toBe('blocked')
      expect((await relationsOf(alice))[bob.id]).toBeUndefined()
    }
  })
})
