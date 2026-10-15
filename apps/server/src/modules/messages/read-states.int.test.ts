import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { identify } from '../../../test/gateway-client'
import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

import type { TestSocket } from '../../../test/gateway-client'
import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, events, close } = createTestApp()
const sockets: TestSocket[] = []

let owner: TestActor
let member: TestActor
let outsider: TestActor
let guild: Awaited<ReturnType<typeof createGuild>>
let textId: string

const call = (actor: TestActor, method: 'GET' | 'POST', url: string, payload?: object) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: actor.headers,
    ...(payload ? { payload } : {}),
  })

const send = async (actor: TestActor, content: string) =>
  (await call(actor, 'POST', `/channels/${textId}/messages`, { content })).json().data.message as {
    id: string
  }

const readStates = async (actor: TestActor) =>
  (await call(actor, 'GET', '/users/@me/read-states')).json().data.readStates as {
    channelId: string
    lastReadMessageId: string
  }[]

const lastMessageId = async (actor: TestActor) =>
  (await call(actor, 'GET', `/guilds/${guild.id}`))
    .json()
    .data.guild.channels.find((c: { id: string }) => c.id === textId).lastMessageId as string | null

beforeAll(async () => {
  await app.listen({ host: '127.0.0.1', port: 0 })
})

beforeEach(async () => {
  await resetState(db, redis)
  events.clear()
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
  member = await signUp(app, { username: 'member', email: 'member@example.com' })
  outsider = await signUp(app, { username: 'outsider', email: 'outsider@example.com' })
  guild = await createGuild(app, owner)
  await addMember(db, guild.id, member.id)
  textId = guild.channels.find((c) => c.type === 'text')?.id as string
})

afterEach(() => {
  for (const socket of sockets.splice(0)) socket.close()
})

afterAll(async () => {
  await close()
})

describe('unread state', () => {
  it('tracks the newest message of each channel', async () => {
    expect(await lastMessageId(member)).toBeNull()

    const message = await send(owner, 'hi')

    expect(await lastMessageId(member)).toBe(message.id)
  })

  it('marks a channel read up to a message and tells the user’s other devices', async () => {
    const message = await send(owner, 'hi')
    const otherDevice = (await identify(app, member.cookie)).socket
    sockets.push(otherDevice)

    const response = await call(member, 'POST', `/channels/${textId}/messages/${message.id}/ack`)

    expect(response.statusCode).toBe(204)
    expect(await readStates(member)).toEqual([{ channelId: textId, lastReadMessageId: message.id }])
    expect(await otherDevice.dispatch('CHANNEL_ACK')).toEqual({
      channelId: textId,
      lastReadMessageId: message.id,
      mentionCount: 0,
    })
  })

  it('never moves the read marker backwards', async () => {
    const older = await send(owner, 'one')
    const newer = await send(owner, 'two')

    await call(member, 'POST', `/channels/${textId}/messages/${newer.id}/ack`)
    await call(member, 'POST', `/channels/${textId}/messages/${older.id}/ack`)

    expect(await readStates(member)).toEqual([{ channelId: textId, lastReadMessageId: newer.id }])
  })

  it('counts your own messages as read', async () => {
    const message = await send(member, 'mine')

    expect(await readStates(member)).toEqual([{ channelId: textId, lastReadMessageId: message.id }])
  })

  it('includes read states in READY', async () => {
    const message = await send(member, 'mine')

    const { socket, ready } = await identify(app, member.cookie)
    sockets.push(socket)

    expect((ready as unknown as { readStates: unknown[] }).readStates).toEqual([
      { channelId: textId, lastReadMessageId: message.id },
    ])
  })

  it('validates the message and hides foreign channels', async () => {
    const message = await send(owner, 'hi')

    const unknown = await call(member, 'POST', `/channels/${textId}/messages/123/ack`)
    const foreign = await call(outsider, 'POST', `/channels/${textId}/messages/${message.id}/ack`)

    expect(unknown.statusCode).toBe(404)
    expect(unknown.json()).toMatchObject({ code: 'UNKNOWN_MESSAGE' })
    expect(foreign.statusCode).toBe(404)
  })
})

describe('marking a server read', () => {
  it('reads every channel up to its newest message and tells the other devices', async () => {
    const second = (
      await call(owner, 'POST', `/guilds/${guild.id}/channels`, { type: 'text', name: 'second' })
    ).json().data.channel as { id: string }
    const first = await send(owner, 'one')
    const other = (
      await call(owner, 'POST', `/channels/${second.id}/messages`, { content: 'two' })
    ).json().data.message as { id: string }
    const otherDevice = (await identify(app, member.cookie)).socket
    sockets.push(otherDevice)

    const response = await call(member, 'POST', `/guilds/${guild.id}/ack`)

    expect(response.statusCode).toBe(204)
    expect(await readStates(member)).toEqual(
      expect.arrayContaining([
        { channelId: textId, lastReadMessageId: first.id },
        { channelId: second.id, lastReadMessageId: other.id },
      ]),
    )
    expect(await otherDevice.dispatch('CHANNEL_ACK')).toMatchObject({ mentionCount: 0 })
  })

  it('hides servers the user is not in', async () => {
    expect((await call(outsider, 'POST', `/guilds/${guild.id}/ack`)).statusCode).toBe(404)
  })
})

describe('typing indicator', () => {
  it('announces typing to the server', async () => {
    const ownerSocket = (await identify(app, owner.cookie)).socket
    sockets.push(ownerSocket)

    const response = await call(member, 'POST', `/channels/${textId}/typing`)

    expect(response.statusCode).toBe(204)
    expect(await ownerSocket.dispatch('TYPING_START')).toMatchObject({
      channelId: textId,
      guildId: guild.id,
      userId: member.id,
      timestamp: expect.any(String),
    })
  })

  it('only works in text channels the user can see', async () => {
    const voiceId = guild.channels.find((c) => c.type === 'voice')?.id
    expect((await call(member, 'POST', `/channels/${voiceId}/typing`)).statusCode).toBe(400)
    expect((await call(outsider, 'POST', `/channels/${textId}/typing`)).statusCode).toBe(404)
  })
})
