import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'
import { channels, messages } from '../../db/schema'

import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, events, close } = createTestApp({ env: { RATE_LIMIT: 'off' } })

type Actor = TestActor & { readonly username: string }

let alice: Actor
let bob: Actor
let carol: Actor
let outsider: Actor

const join = async (username: string): Promise<Actor> => ({
  ...(await signUp(app, { username, email: `${username}@example.com` })),
  username,
})

const api = (
  actor: TestActor,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  payload?: object,
) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: actor.headers,
    ...(payload ? { payload } : {}),
  })

const befriend = async (a: Actor, b: Actor) => {
  await api(a, 'POST', '/users/@me/relationships', { username: b.username })
  await api(b, 'PUT', `/users/@me/relationships/${a.id}`, { type: 'friend' })
}

const open = async (actor: Actor, recipientIds: string[], encrypted: boolean) =>
  (
    await api(actor, 'POST', '/users/@me/channels', {
      recipientIds,
      ...(encrypted ? { encrypted: true } : {}),
    })
  ).json().data.channel as { id: string; encrypted: boolean }

const say = (actor: Actor, channelId: string) =>
  api(actor, 'POST', `/channels/${channelId}/messages`, {
    ciphertext: randomBytes(48).toString('base64'),
  })

const deletedFor = () =>
  events.published
    .filter((event) => event.type === 'PRIVATE_CHANNEL_DELETE')
    .map((event) => ({ topic: event.topic, data: event.data }))

beforeEach(async () => {
  await resetState(db, redis)
  alice = await join('alice')
  bob = await join('bob')
  carol = await join('carol')
  outsider = await join('outsider')
  await befriend(alice, bob)
  await befriend(alice, carol)
  events.clear()
})

afterAll(async () => {
  await close()
})

describe('deleting an encrypted conversation', () => {
  it('takes it away for both people with everything in it; a new one starts afresh', async () => {
    const dm = await open(alice, [bob.id], true)
    await say(alice, dm.id)
    await say(bob, dm.id)

    const deleted = await api(bob, 'DELETE', `/channels/${dm.id}`)

    expect(deleted.statusCode).toBe(204)
    expect(await db.select().from(channels).where(eq(channels.id, dm.id))).toEqual([])
    expect(await db.select().from(messages).where(eq(messages.channelId, dm.id))).toEqual([])
    expect(deletedFor()).toEqual(
      expect.arrayContaining([
        { topic: `user:${alice.id}`, data: { id: dm.id, deleted: true } },
        { topic: `user:${bob.id}`, data: { id: dm.id, deleted: true } },
      ]),
    )
    expect((await api(alice, 'GET', `/channels/${dm.id}/messages`)).statusCode).toBe(404)
    const again = await open(alice, [bob.id], true)
    expect(again.encrypted).toBe(true)
    expect(again.id).not.toBe(dm.id)
  })

  it('is only for encrypted conversations, and only for the people in them', async () => {
    const plain = await open(alice, [bob.id], false)
    const encrypted = await open(alice, [bob.id], true)

    const refused = await api(alice, 'DELETE', `/channels/${plain.id}`)
    expect(refused.statusCode).toBe(403)
    expect(refused.json().code).toBe('NOT_ENCRYPTED')
    const stranger = await api(outsider, 'DELETE', `/channels/${encrypted.id}`)
    expect(stranger.statusCode).toBe(404)
    expect(stranger.json().code).toBe('UNKNOWN_CHANNEL')
    expect(await db.select().from(channels).where(eq(channels.id, encrypted.id))).toHaveLength(1)
  })

  it('in a group, only its owner deletes it, for everyone in it', async () => {
    const group = await open(alice, [bob.id, carol.id], true)

    const notOwner = await api(bob, 'DELETE', `/channels/${group.id}`)
    expect(notOwner.statusCode).toBe(403)
    expect(notOwner.json().code).toBe('MISSING_PERMISSIONS')

    expect((await api(alice, 'DELETE', `/channels/${group.id}`)).statusCode).toBe(204)
    expect(
      deletedFor()
        .map((event) => event.topic)
        .sort(),
    ).toEqual([alice.id, bob.id, carol.id].map((id) => `user:${id}`).sort())
  })

  it('is not for bots and needs a session', async () => {
    const dm = await open(alice, [bob.id], true)
    const anonymous = await app.inject({ method: 'DELETE', url: `/api/v1/channels/${dm.id}` })
    expect(anonymous.statusCode).toBe(401)
  })
})
