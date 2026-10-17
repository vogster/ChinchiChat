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
let guildChannelId: string

const api = (actor: TestActor, method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: actor.headers,
    ...(payload ? { payload } : {}),
  })

const dmWith = async (from: TestActor, to: TestActor) =>
  (await api(from, 'POST', '/users/@me/channels', { recipientIds: [to.id] })).json().data
    .channel as { id: string }

const listed = async (actor: TestActor) =>
  ((await api(actor, 'GET', '/users/@me/channels')).json().data.channels as { id: string }[]).map(
    (channel) => channel.id,
  )

const send = async (actor: TestActor, channelId: string, content: string) =>
  (await api(actor, 'POST', `/channels/${channelId}/messages`, { content })).json().data
    .message as { id: string }

const hide = (actor: TestActor, channelId: string) =>
  api(actor, 'DELETE', `/users/@me/channels/${channelId}`)

const mentionCounts = async (actor: TestActor) =>
  (await api(actor, 'GET', '/users/@me/read-states')).json().data.mentionCounts as Record<
    string,
    number
  >

const published = (type: string) =>
  events.published.filter((event) => event.type === type).map((event) => event.topic)

beforeAll(async () => {
  await app.listen({ host: '127.0.0.1', port: 0 })
})

beforeEach(async () => {
  await resetState(db, redis)
  events.clear()
  alice = await signUp(app, { username: 'alice', email: 'alice@example.com' })
  bob = await signUp(app, { username: 'bob', email: 'bob@example.com' })
  carol = await signUp(app, { username: 'carol', email: 'carol@example.com' })
  const guild = await createGuild(app, alice)
  guildChannelId = guild.channels[0]?.id as string
  await addMember(db, guild.id, bob.id)
  await addMember(db, guild.id, carol.id)
})

afterEach(() => {
  for (const socket of sockets.splice(0)) socket.close()
})

afterAll(async () => {
  await close()
})

describe('hiding a DM', () => {
  it('takes it off my list only, marks it read and tells my other tabs', async () => {
    const channel = await dmWith(alice, bob)
    await send(alice, channel.id, 'one')
    await send(alice, channel.id, 'two')
    expect(await mentionCounts(bob)).toEqual({ [channel.id]: 2 })
    events.clear()

    expect((await hide(bob, channel.id)).statusCode).toBe(204)

    expect(await listed(bob)).toEqual([])
    expect(await listed(alice)).toEqual([channel.id])
    expect(await mentionCounts(bob)).toEqual({})
    expect(published('PRIVATE_CHANNEL_DELETE')).toEqual([`user:${bob.id}`])
    const { socket, ready } = await identify(app, bob.cookie)
    sockets.push(socket)
    expect((ready as unknown as { privateChannels: unknown[] }).privateChannels).toEqual([])
    // The history stays: it comes back with the conversation.
    const history = await api(bob, 'GET', `/channels/${channel.id}/messages`)
    expect(history.json().data.messages).toHaveLength(2)
  })

  it('brings it back with the next message, announced before the message itself', async () => {
    const channel = await dmWith(alice, bob)
    await send(alice, channel.id, 'before')
    await hide(bob, channel.id)
    events.clear()

    await send(alice, channel.id, 'after')

    expect(await listed(bob)).toEqual([channel.id])
    expect(await mentionCounts(bob)).toEqual({ [channel.id]: 1 })
    expect(published('PRIVATE_CHANNEL_CREATE')).toEqual([`user:${bob.id}`])
    const order = events.published
      .filter((event) => event.topic === `user:${bob.id}`)
      .map((event) => event.type)
    expect(order.indexOf('PRIVATE_CHANNEL_CREATE')).toBeLessThan(order.indexOf('MESSAGE_CREATE'))

    // Shown again: the next message announces nothing new.
    events.clear()
    await send(alice, channel.id, 'again')
    expect(published('PRIVATE_CHANNEL_CREATE')).toEqual([])
  })

  it('comes back when I open the DM again, even with no new message', async () => {
    const channel = await dmWith(alice, bob)
    await hide(bob, channel.id)
    events.clear()

    expect((await dmWith(bob, alice)).id).toBe(channel.id)

    expect(await listed(bob)).toEqual([channel.id])
    expect(published('PRIVATE_CHANNEL_CREATE')).toEqual([`user:${bob.id}`])
  })

  it('works for a DM without messages and for a group, and twice in a row', async () => {
    const empty = await dmWith(alice, bob)
    await api(alice, 'POST', '/users/@me/relationships', { username: 'bob' })
    await api(bob, 'POST', '/users/@me/relationships', { username: 'alice' })
    await api(alice, 'POST', '/users/@me/relationships', { username: 'carol' })
    await api(carol, 'POST', '/users/@me/relationships', { username: 'alice' })
    const group = (
      await api(alice, 'POST', '/users/@me/channels', { recipientIds: [bob.id, carol.id] })
    ).json().data.channel as { id: string }

    expect((await hide(bob, empty.id)).statusCode).toBe(204)
    expect((await hide(bob, group.id)).statusCode).toBe(204)
    expect((await hide(bob, group.id)).statusCode).toBe(204)
    expect(await listed(bob)).toEqual([])
    // Hiding is not leaving: Bob still gets the group's messages.
    events.clear()
    await send(carol, group.id, 'hello group')
    expect(await listed(bob)).toEqual([group.id])
  })

  it('answers 404 for a DM I am not in and for server channels', async () => {
    const channel = await dmWith(alice, bob)

    const stranger = await hide(carol, channel.id)
    expect(stranger.statusCode).toBe(404)
    expect(stranger.json().code).toBe('UNKNOWN_CHANNEL')
    expect((await hide(alice, guildChannelId)).statusCode).toBe(404)
    expect(await listed(alice)).toEqual([channel.id])
  })
})
