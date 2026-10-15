import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { identify } from '../../../test/gateway-client'
import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

import type { TestSocket } from '../../../test/gateway-client'
import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, events, close } = createTestApp({ env: { RATE_LIMIT: 'off' } })
const sockets: TestSocket[] = []

let alice: TestActor
let bob: TestActor
let carol: TestActor
let dave: TestActor
let erin: TestActor
let guildId: string

const api = (actor: TestActor, method: 'POST' | 'PUT' | 'PATCH', url: string, payload: object) =>
  app.inject({ method, url: `/api/v1${url}`, headers: actor.headers, payload })

const topicsOf = (type: string) =>
  events.published
    .filter((event) => event.type === type)
    .map((event) => event.topic)
    .sort()

beforeAll(async () => {
  await app.listen({ host: '127.0.0.1', port: 0 })
})

beforeEach(async () => {
  await resetState(db, redis)
  alice = await signUp(app, { username: 'alice', email: 'alice@example.com' })
  bob = await signUp(app, { username: 'bob', email: 'bob@example.com' })
  carol = await signUp(app, { username: 'carol', email: 'carol@example.com' })
  dave = await signUp(app, { username: 'dave', email: 'dave@example.com' })
  erin = await signUp(app, { username: 'erin', email: 'erin@example.com' })
  // Bob shares a server with Alice, Carol is her friend, Dave has asked to be; Erin is nobody.
  guildId = (await createGuild(app, bob)).id
  await addMember(db, guildId, alice.id)
  await api(alice, 'POST', '/users/@me/relationships', { username: 'carol' })
  await api(carol, 'PUT', `/users/@me/relationships/${alice.id}`, { type: 'friend' })
  await api(dave, 'POST', '/users/@me/relationships', { username: 'alice' })
  events.clear()
})

afterEach(() => {
  for (const socket of sockets.splice(0)) socket.close()
})

afterAll(async () => {
  await close()
})

describe('USER_UPDATE', () => {
  it('tells everyone who shows the user that their profile changed', async () => {
    await api(alice, 'PATCH', '/users/@me', { displayName: 'Алиса' })

    expect(topicsOf('USER_UPDATE')).toEqual(
      [`guild:${guildId}`, ...[alice, carol, dave].map((u) => `user:${u.id}`)].sort(),
    )
    const [event] = events.published.filter((e) => e.type === 'USER_UPDATE')
    expect(event?.data).toEqual({
      id: alice.id,
      username: 'alice',
      displayName: 'Алиса',
      avatarUrl: null,
    })
  })

  it('reaches DM partners too', async () => {
    const dm = await api(alice, 'POST', '/users/@me/channels', { recipientIds: [bob.id] })
    expect(dm.statusCode).toBe(200)
    events.clear()

    await api(alice, 'PATCH', '/users/@me', { displayName: 'Алиса' })

    expect(topicsOf('USER_UPDATE')).toContain(`user:${bob.id}`)
    expect(topicsOf('USER_UPDATE')).not.toContain(`user:${erin.id}`)
  })

  it('skips DM partners on the other side of a block', async () => {
    await api(alice, 'POST', '/users/@me/channels', { recipientIds: [carol.id] })
    await api(alice, 'PUT', `/users/@me/relationships/${carol.id}`, { type: 'blocked' })
    events.clear()

    await api(alice, 'PATCH', '/users/@me', { displayName: 'Алиса' })

    expect(topicsOf('USER_UPDATE')).not.toContain(`user:${carol.id}`)
  })

  it('is not sent for privacy changes nobody else sees', async () => {
    await api(alice, 'PATCH', '/users/@me', { dmPolicy: 'friends' })

    expect(topicsOf('USER_UPDATE')).toEqual([])
  })
})

describe('presence of friends', () => {
  it('reaches friends who share no server, and READY shows it', async () => {
    const carolSocket = await identify(app, carol.cookie)
    sockets.push(carolSocket.socket)
    events.clear()

    const aliceSocket = await identify(app, alice.cookie)
    sockets.push(aliceSocket.socket)

    expect(topicsOf('PRESENCE_UPDATE')).toContain(`user:${carol.id}`)
    expect(aliceSocket.ready.presences).toEqual(
      expect.arrayContaining([{ userId: carol.id, status: 'online' }]),
    )
  })

  it('tells new friends whether the other is online', async () => {
    const daveSocket = await identify(app, dave.cookie)
    sockets.push(daveSocket.socket)
    events.clear()

    await api(alice, 'PUT', `/users/@me/relationships/${dave.id}`, { type: 'friend' })

    expect(events.published).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          topic: `user:${alice.id}`,
          type: 'PRESENCE_UPDATE',
          data: { userId: dave.id, status: 'online' },
        }),
      ]),
    )
  })

  it('hides the status again when a friendship ends without a shared server', async () => {
    await api(alice, 'PUT', `/users/@me/relationships/${carol.id}`, { type: 'blocked' })

    expect(events.published).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          topic: `user:${carol.id}`,
          type: 'PRESENCE_UPDATE',
          data: { userId: alice.id, status: 'offline' },
        }),
        expect.objectContaining({
          topic: `user:${alice.id}`,
          type: 'PRESENCE_UPDATE',
          data: { userId: carol.id, status: 'offline' },
        }),
      ]),
    )
  })
})
