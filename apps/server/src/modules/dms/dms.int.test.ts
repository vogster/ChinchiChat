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
let guildId: string

const api = (
  actor: TestActor,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: actor.headers,
    ...(payload ? { payload } : {}),
  })

const openDm = async (from: TestActor, to: TestActor) => {
  const response = await api(from, 'POST', '/users/@me/channels', { recipientIds: [to.id] })
  return response
}

const dmWith = async (from: TestActor, to: TestActor) => {
  const response = await openDm(from, to)
  expect(response.statusCode).toBe(200)
  return response.json().data.channel as { id: string; type: string; recipients: { id: string }[] }
}

const send = (actor: TestActor, channelId: string, payload: object) =>
  api(actor, 'POST', `/channels/${channelId}/messages`, payload)

beforeAll(async () => {
  await app.listen({ host: '127.0.0.1', port: 0 })
})

beforeEach(async () => {
  await resetState(db, redis)
  events.clear()
  alice = await signUp(app, { username: 'alice', email: 'alice@example.com' })
  bob = await signUp(app, { username: 'bob', email: 'bob@example.com' })
  carol = await signUp(app, { username: 'carol', email: 'carol@example.com' })
  dave = await signUp(app, { username: 'dave', email: 'dave@example.com' })
  // Alice and Bob share a server; Dave is Alice's friend; Carol knows nobody.
  const guild = await createGuild(app, alice)
  guildId = guild.id
  await addMember(db, guild.id, bob.id)
  await api(alice, 'POST', '/users/@me/relationships', { username: 'dave' })
  await api(dave, 'PUT', `/users/@me/relationships/${alice.id}`, { type: 'friend' })
})

afterEach(() => {
  for (const socket of sockets.splice(0)) socket.close()
})

afterAll(async () => {
  await close()
})

describe('opening DMs', () => {
  it('opens one DM per pair, listed for both and announced to both', async () => {
    const channel = await dmWith(alice, bob)
    expect(channel).toMatchObject({ type: 'dm', ownerId: null, recipients: [{ id: bob.id }] })
    expect((await dmWith(alice, bob)).id).toBe(channel.id)
    expect((await dmWith(bob, alice)).id).toBe(channel.id)

    const list = await api(bob, 'GET', '/users/@me/channels')
    expect(list.json().data.channels).toMatchObject([
      { id: channel.id, recipients: [{ id: alice.id }] },
    ])
    expect(events.published).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ topic: `user:${bob.id}`, type: 'PRIVATE_CHANNEL_CREATE' }),
        expect.objectContaining({ topic: `user:${alice.id}`, type: 'PRIVATE_CHANNEL_CREATE' }),
      ]),
    )
  })

  it('lets friends and server mates message each other, not strangers', async () => {
    expect((await openDm(alice, dave)).statusCode).toBe(200)
    const stranger = await openDm(alice, carol)
    expect(stranger.statusCode).toBe(403)
    expect(stranger.json().code).toBe('CANNOT_MESSAGE_USER')
  })

  it('refuses yourself and unknown users', async () => {
    expect((await openDm(alice, alice)).statusCode).toBe(400)
    const unknown = await api(alice, 'POST', '/users/@me/channels', { recipientIds: ['123456789'] })
    expect(unknown.statusCode).toBe(404)
  })

  it('lists DMs in READY', async () => {
    const channel = await dmWith(alice, bob)
    const { socket, ready } = await identify(app, bob.cookie)
    sockets.push(socket)
    expect(
      (ready as unknown as { privateChannels: { id: string }[] }).privateChannels,
    ).toMatchObject([{ id: channel.id }])
  })
})

describe('messaging in DMs', () => {
  it('delivers messages to both people only, through their own topics', async () => {
    const channel = await dmWith(alice, bob)
    events.clear()

    const sent = await send(alice, channel.id, { content: `hi <@${carol.id}> @everyone` })

    expect(sent.statusCode).toBe(201)
    const message = sent.json().data.message
    expect(message).toMatchObject({ guildId: null, mentions: { users: [], everyone: false } })
    const created = events.published.filter((e) => e.type === 'MESSAGE_CREATE')
    expect(created.map((e) => e.topic).sort()).toEqual(
      [`user:${alice.id}`, `user:${bob.id}`].sort(),
    )

    const history = await api(bob, 'GET', `/channels/${channel.id}/messages`)
    expect(history.json().data.messages.map((m: { id: string }) => m.id)).toEqual([message.id])
  })

  it('hides the DM from everyone else, and from server-channel endpoints', async () => {
    const channel = await dmWith(alice, bob)
    expect((await api(carol, 'GET', `/channels/${channel.id}/messages`)).statusCode).toBe(404)
    expect((await send(carol, channel.id, { content: 'x' })).statusCode).toBe(404)
    expect((await api(alice, 'GET', `/channels/${channel.id}`)).statusCode).toBe(404)
    expect((await api(alice, 'PATCH', `/channels/${channel.id}`, { name: 'x' })).statusCode).toBe(
      404,
    )
  })

  it('supports replies, reactions, typing and attachments', async () => {
    const channel = await dmWith(alice, bob)
    const first = (await send(alice, channel.id, { content: 'q' })).json().data.message
    const reply = await send(bob, channel.id, { content: 'a', replyTo: first.id })
    expect(reply.json().data.message.mentions.users).toEqual([alice.id])

    const react = await api(
      bob,
      'PUT',
      `/channels/${channel.id}/messages/${first.id}/reactions/${encodeURIComponent('👍')}/@me`,
    )
    expect(react.statusCode).toBe(204)
    expect((await api(alice, 'POST', `/channels/${channel.id}/typing`)).statusCode).toBe(204)
    expect(events.published.at(-1)).toMatchObject({ type: 'TYPING_START', data: { guildId: null } })

    const slot = await api(alice, 'POST', `/channels/${channel.id}/attachments`, {
      filename: 'a.txt',
      size: 3,
    })
    expect(slot.statusCode).toBe(201)
  })

  it('stops messages both ways when either person blocks the other', async () => {
    const channel = await dmWith(alice, bob)
    const before = (await send(alice, channel.id, { content: 'before' })).json().data.message
    await api(
      bob,
      'PUT',
      `/channels/${channel.id}/messages/${before.id}/reactions/${encodeURIComponent('👍')}/@me`,
    )
    await api(bob, 'PUT', `/users/@me/relationships/${alice.id}`, { type: 'blocked' })

    for (const actor of [alice, bob]) {
      const refused = await send(actor, channel.id, { content: 'after' })
      expect(refused.statusCode).toBe(403)
      expect(refused.json().code).toBe('CANNOT_MESSAGE_USER')
    }
    const old = (await api(alice, 'GET', `/channels/${channel.id}/messages`)).json().data
      .messages[0] as { id: string }
    const joined = await api(
      alice,
      'PUT',
      `/channels/${channel.id}/messages/${old.id}/reactions/${encodeURIComponent('👍')}/@me`,
    )
    expect(joined.json().code).toBe('CANNOT_MESSAGE_USER')
    const edited = await api(alice, 'PATCH', `/channels/${channel.id}/messages/${old.id}`, {
      content: 'rewritten',
    })
    expect(edited.json().code).toBe('CANNOT_MESSAGE_USER')
    expect((await api(alice, 'GET', `/channels/${channel.id}/messages`)).statusCode).toBe(200)
  })

  it('stops messages once the two no longer share a server', async () => {
    const channel = await dmWith(alice, bob)

    await api(bob, 'DELETE', `/guilds/${guildId}/members/@me`)

    const refused = await send(alice, channel.id, { content: 'still there?' })
    expect(refused.json().code).toBe('CANNOT_MESSAGE_USER')
  })

  it('counts unread DMs like mentions until read', async () => {
    const channel = await dmWith(alice, bob)
    await send(alice, channel.id, { content: 'one' })
    const last = (await send(alice, channel.id, { content: 'two' })).json().data.message

    const counts = async () =>
      (await api(bob, 'GET', '/users/@me/read-states')).json().data.mentionCounts as Record<
        string,
        number
      >
    expect(await counts()).toEqual({ [channel.id]: 2 })

    await api(bob, 'POST', `/channels/${channel.id}/messages/${last.id}/ack`)
    expect(await counts()).toEqual({})
  })
})

describe('privacy', () => {
  it('lets people take DMs from friends only', async () => {
    const channel = await dmWith(alice, bob)
    const set = await api(bob, 'PATCH', '/users/@me', { dmPolicy: 'friends' })
    expect(set.json().data.user.dmPolicy).toBe('friends')

    // Alice only shares a server with Bob: no new DMs, no messages in the old one.
    const reopened = await openDm(alice, bob)
    expect(reopened.json().code).toBe('CANNOT_MESSAGE_USER')
    const refused = await send(alice, channel.id, { content: 'hi' })
    expect(refused.json().code).toBe('CANNOT_MESSAGE_USER')
    // Friends-only works both ways: Bob can't start what Alice could not answer.
    expect((await send(bob, channel.id, { content: 'hi' })).json().code).toBe('CANNOT_MESSAGE_USER')

    // Friends always get through.
    await api(dave, 'PATCH', '/users/@me', { dmPolicy: 'friends' })
    expect((await openDm(alice, dave)).statusCode).toBe(200)
  })
})
