import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { SESSION_COOKIE, WEB_ORIGIN } from '../../test/auth-helpers'
import { connectGateway, identify } from '../../test/gateway-client'
import { addMember, createGuild, signUp } from '../../test/guild-helpers'
import { createTestApp, resetState } from '../../test/test-app'
import { MAX_CONNECTIONS_PER_USER } from './connection-limits'

import type { Frame, TestSocket } from '../../test/gateway-client'
import type { TestActor } from '../../test/guild-helpers'

const HEARTBEAT_MS = 400
const { app, db, redis, close } = createTestApp({
  env: { GATEWAY_HEARTBEAT_MS: String(HEARTBEAT_MS) },
})
const sockets: TestSocket[] = []

let owner: TestActor
let member: TestActor
let outsider: TestActor
let guild: Awaited<ReturnType<typeof createGuild>>
let textId: string

const keep = (socket: TestSocket) => {
  sockets.push(socket)
  return socket
}

const send = (actor: TestActor, content: string) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/channels/${textId}/messages`,
    headers: actor.headers,
    payload: { content },
  })

/** Waits for a PRESENCE_UPDATE of `userId` → `status` that arrives after `mark` frames. */
const presence = (socket: TestSocket, mark: number, userId: string, status: string) =>
  socket.next((frame: Frame) => {
    const d = frame.d as { userId?: string; status?: string } | undefined
    return (
      frame.t === 'PRESENCE_UPDATE' &&
      socket.frames.indexOf(frame) >= mark &&
      d?.userId === userId &&
      d.status === status
    )
  })

beforeAll(async () => {
  await app.listen({ host: '127.0.0.1', port: 0 })
})

beforeEach(async () => {
  await resetState(db, redis)
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
  member = await signUp(app, { username: 'member', email: 'member@example.com' })
  outsider = await signUp(app, { username: 'outsider', email: 'outsider@example.com' })
  guild = await createGuild(app, owner, 'Cats')
  await addMember(db, guild.id, member.id)
  textId = guild.channels.find((c) => c.type === 'text')?.id as string
})

afterEach(() => {
  for (const socket of sockets.splice(0)) socket.close()
})

afterAll(async () => {
  await close()
})

describe('handshake', () => {
  it('greets with HELLO', async () => {
    const socket = keep(await connectGateway(app))

    const hello = await socket.next((frame) => frame.op === 10)
    expect(hello.d).toEqual({ heartbeatInterval: HEARTBEAT_MS, version: 1 })
  })

  it('identifies with the session cookie and sends READY', async () => {
    const { socket, ready, readySeq } = await identify(app, member.cookie)
    keep(socket)

    expect(ready.sessionId).toMatch(/^[a-f0-9]{32}$/)
    expect(ready.user).toMatchObject({ id: member.id, username: 'member' })
    expect(ready.guilds).toEqual([
      expect.objectContaining({ id: guild.id, channels: expect.any(Array) }),
    ])
    expect(readySeq).toEqual(expect.any(Number))
  })

  it('identifies native clients with a token', async () => {
    const socket = keep(await connectGateway(app, { origin: null }))
    socket.send({ op: 2, d: { token: owner.cookie } })

    const ready = await socket.dispatch<{ user: { id: string } }>('READY')
    expect(ready.user.id).toBe(owner.id)
  })

  it('closes with 4004 when credentials are missing or wrong', async () => {
    for (const d of [{}, { token: 'x'.repeat(43) }]) {
      const socket = await connectGateway(app)
      socket.send({ op: 2, d })
      expect((await socket.closed).code).toBe(4004)
    }
  })

  it('closes with 4001 on undecodable frames', async () => {
    const socket = await connectGateway(app, { cookie: member.cookie })
    socket.send({ op: 99 })
    expect((await socket.closed).code).toBe(4001)
  })

  it('closes with 4005 on a second IDENTIFY', async () => {
    const { socket } = await identify(app, member.cookie)
    socket.send({ op: 2, d: {} })
    expect((await socket.closed).code).toBe(4005)
  })

  it('lets one user hold only so many connections (each one costs a full READY)', async () => {
    for (let i = 0; i < MAX_CONNECTIONS_PER_USER; i++)
      keep((await identify(app, member.cookie)).socket)
    const extra = keep(await connectGateway(app, { cookie: member.cookie }))
    extra.send({ op: 2, d: {} })
    expect((await extra.closed).code).toBe(4008)
    // Someone else is not affected.
    keep((await identify(app, owner.cookie)).socket)
  })

  it('closes with 4003 when nobody identifies in time', async () => {
    const socket = await connectGateway(app, { cookie: member.cookie, autoHeartbeat: false })
    expect((await socket.closed).code).toBe(4003)
  })

  it('lets a native shell in from its own origin when it brings a token, not a cookie', async () => {
    // Desktop webviews send an Origin of their own (tauri://localhost, http://tauri.localhost);
    // without a cookie there is nothing to hijack, and IDENTIFY still has to carry a token.
    const socket = keep(await connectGateway(app, { origin: 'http://tauri.localhost' }))
    socket.send({ op: 2, d: { token: owner.cookie } })

    const ready = await socket.dispatch<{ user: { id: string } }>('READY')
    expect(ready.user.id).toBe(owner.id)
  })

  it('refuses cookie connections from foreign or missing origins (cross-site WebSocket hijacking)', async () => {
    await expect(
      connectGateway(app, { cookie: member.cookie, origin: 'https://evil.example' }),
    ).rejects.toThrow('HTTP 403')
    await expect(connectGateway(app, { cookie: member.cookie, origin: null })).rejects.toThrow(
      'HTTP 403',
    )
  })
})

describe('heartbeat', () => {
  it('acknowledges heartbeats', async () => {
    const { socket } = await identify(app, member.cookie)
    keep(socket)
    socket.send({ op: 1, d: null })
    await socket.next((frame) => frame.op === 11)
  })

  it('closes with 4009 when heartbeats stop', async () => {
    const { socket } = await identify(app, member.cookie, { autoHeartbeat: false })
    expect((await socket.closed).code).toBe(4009)
  })
})

describe('dispatch', () => {
  it('delivers messages to members of the server only', async () => {
    const memberSocket = keep((await identify(app, member.cookie)).socket)
    const outsiderSocket = keep((await identify(app, outsider.cookie)).socket)

    await send(owner, 'hello cats')

    const created = await memberSocket.dispatch<{ content: string }>('MESSAGE_CREATE')
    expect(created.content).toBe('hello cats')
    expect(await outsiderSocket.none((frame) => frame.t === 'MESSAGE_CREATE')).toBe(true)
  })

  it('numbers events after READY in increasing order', async () => {
    const { socket, readySeq } = await identify(app, member.cookie)
    keep(socket)

    await send(owner, 'one')
    await send(owner, 'two')

    const first = await socket.next((frame) => frame.t === 'MESSAGE_CREATE')
    const second = await socket.next((frame) => frame.t === 'MESSAGE_CREATE' && frame !== first)
    expect(first.s).toBeGreaterThan(readySeq)
    expect(second.s).toBeGreaterThan(first.s as number)
  })

  it('starts delivering a server as soon as the user joins it', async () => {
    const outsiderSocket = keep((await identify(app, outsider.cookie)).socket)
    const memberSocket = keep((await identify(app, member.cookie)).socket)
    const invite = await app.inject({
      method: 'POST',
      url: `/api/v1/channels/${textId}/invites`,
      headers: member.headers,
      payload: {},
    })

    await app.inject({
      method: 'POST',
      url: `/api/v1/invites/${invite.json().data.invite.code}`,
      headers: outsider.headers,
    })

    expect(await outsiderSocket.dispatch('GUILD_CREATE')).toMatchObject({
      id: guild.id,
      channels: expect.any(Array),
    })
    expect(await memberSocket.dispatch('GUILD_MEMBER_ADD')).toMatchObject({
      guildId: guild.id,
      member: { user: { id: outsider.id } },
    })

    await send(owner, 'welcome!')
    const message = await outsiderSocket.dispatch<{ content: string }>('MESSAGE_CREATE')
    expect(message.content).toBe('welcome!')
  })

  it('stops delivering a server after leaving it, and tells the others', async () => {
    const memberSocket = keep((await identify(app, member.cookie)).socket)
    const ownerSocket = keep((await identify(app, owner.cookie)).socket)

    await app.inject({
      method: 'DELETE',
      url: `/api/v1/guilds/${guild.id}/members/@me`,
      headers: member.headers,
    })

    expect(await memberSocket.dispatch('GUILD_DELETE')).toEqual({ id: guild.id })
    expect(await ownerSocket.dispatch('GUILD_MEMBER_REMOVE')).toEqual({
      guildId: guild.id,
      userId: member.id,
    })
    await send(owner, 'after you left')
    expect(await memberSocket.none((frame) => frame.t === 'MESSAGE_CREATE')).toBe(true)
  })

  it('announces channel and server changes', async () => {
    const socket = keep((await identify(app, member.cookie)).socket)

    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/guilds/${guild.id}/channels`,
      headers: owner.headers,
      payload: { type: 'text', name: 'news' },
    })
    const channelId = created.json().data.channel.id
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/channels/${channelId}`,
      headers: owner.headers,
      payload: { topic: 'Daily news' },
    })
    await app.inject({
      method: 'DELETE',
      url: `/api/v1/channels/${channelId}`,
      headers: owner.headers,
    })
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/guilds/${guild.id}`,
      headers: owner.headers,
      payload: { name: 'Dogs' },
    })
    await app.inject({
      method: 'DELETE',
      url: `/api/v1/guilds/${guild.id}`,
      headers: owner.headers,
    })

    expect(await socket.dispatch('CHANNEL_CREATE')).toMatchObject({ name: 'news' })
    expect(await socket.dispatch('CHANNEL_UPDATE')).toMatchObject({ topic: 'Daily news' })
    expect(await socket.dispatch('CHANNEL_DELETE')).toEqual({ id: channelId, guildId: guild.id })
    expect(await socket.dispatch('GUILD_UPDATE')).toMatchObject({ name: 'Dogs' })
    expect(await socket.dispatch('GUILD_DELETE')).toEqual({ id: guild.id })
  })
})

describe('resume', () => {
  it('replays what was missed while disconnected', async () => {
    const { socket, ready, readySeq } = await identify(app, member.cookie)
    socket.close()
    await socket.closed

    await send(owner, 'while you were away')

    const resumed = keep(await connectGateway(app, { cookie: member.cookie }))
    resumed.send({ op: 6, d: { sessionId: ready.sessionId, seq: readySeq } })

    const missed = await resumed.dispatch<{ content: string }>('MESSAGE_CREATE')
    expect(missed.content).toBe('while you were away')
    await resumed.dispatch('RESUMED')
    expect(resumed.frames.some((frame) => frame.t === 'READY')).toBe(false)
  })

  it('refuses sessions it does not know, or that belong to someone else', async () => {
    const { socket, ready, readySeq } = await identify(app, member.cookie)
    socket.close()

    for (const [cookie, sessionId] of [
      [member.cookie, 'f'.repeat(32)],
      [outsider.cookie, ready.sessionId],
    ] as const) {
      const attempt = keep(await connectGateway(app, { cookie }))
      attempt.send({ op: 6, d: { sessionId, seq: readySeq } })
      expect((await attempt.next((frame) => frame.op === 9)).d).toBe(false)
    }
  })
})

describe('resume history', () => {
  it('replays nothing from before the session began', async () => {
    await send(owner, 'said before you connected')
    const { socket, ready, readySeq } = await identify(app, member.cookie)
    socket.close()
    await socket.closed

    const attempt = keep(await connectGateway(app, { cookie: member.cookie }))
    attempt.send({ op: 6, d: { sessionId: ready.sessionId, seq: Math.max(readySeq - 5, 0) } })

    expect((await attempt.next((frame) => frame.op === 9)).d).toBe(false)
    expect(attempt.frames.some((frame) => frame.t === 'MESSAGE_CREATE')).toBe(false)
  })
})

describe('presence', () => {
  it('announces when members come online, change status and go offline', async () => {
    const ownerSocket = keep((await identify(app, owner.cookie)).socket)
    const { socket: memberSocket, ready } = await identify(app, member.cookie)
    keep(memberSocket)

    expect(ready.presences).toContainEqual({ userId: owner.id, status: 'online' })
    await presence(ownerSocket, 0, member.id, 'online')

    let mark = ownerSocket.frames.length
    memberSocket.send({ op: 3, d: { status: 'dnd' } })
    await presence(ownerSocket, mark, member.id, 'dnd')

    mark = ownerSocket.frames.length
    memberSocket.send({ op: 3, d: { status: 'invisible' } })
    await presence(ownerSocket, mark, member.id, 'offline')

    mark = ownerSocket.frames.length
    memberSocket.send({ op: 3, d: { status: 'online' } })
    await presence(ownerSocket, mark, member.id, 'online')

    mark = ownerSocket.frames.length
    memberSocket.close()
    await presence(ownerSocket, mark, member.id, 'offline')
  })

  it('includes your own status in READY', async () => {
    const { socket, ready } = await identify(app, outsider.cookie)
    keep(socket)
    expect(ready.presences).toContainEqual({ userId: outsider.id, status: 'online' })
  })

  it('introduces a newcomer and the people already online to each other', async () => {
    const ownerSocket = keep((await identify(app, owner.cookie)).socket)
    const newcomerSocket = keep((await identify(app, outsider.cookie)).socket)
    const invite = await app.inject({
      method: 'POST',
      url: `/api/v1/channels/${textId}/invites`,
      headers: owner.headers,
      payload: {},
    })
    const mark = ownerSocket.frames.length

    await app.inject({
      method: 'POST',
      url: `/api/v1/invites/${invite.json().data.invite.code}`,
      headers: outsider.headers,
    })

    const joined = await newcomerSocket.dispatch<{ presences: unknown[] }>('GUILD_CREATE')
    expect(joined.presences).toContainEqual({ userId: owner.id, status: 'online' })
    await presence(ownerSocket, mark, outsider.id, 'online')
  })

  it('stays online while another device of the same user is connected', async () => {
    const ownerSocket = keep((await identify(app, owner.cookie)).socket)
    const first = await identify(app, member.cookie)
    keep((await identify(app, member.cookie)).socket)
    await presence(ownerSocket, 0, member.id, 'online')

    const mark = ownerSocket.frames.length
    first.socket.close()

    expect(
      await ownerSocket.none(
        (frame) =>
          ownerSocket.frames.indexOf(frame) >= mark &&
          frame.t === 'PRESENCE_UPDATE' &&
          (frame.d as { status: string }).status === 'offline',
      ),
    ).toBe(true)
  })
})

describe('session revocation', () => {
  it('disconnects a device as soon as its session is logged out', async () => {
    const { socket } = await identify(app, member.cookie)

    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { cookie: `${SESSION_COOKIE}=${member.cookie}`, origin: WEB_ORIGIN },
    })

    expect((await socket.closed).code).toBe(4004)
  })

  it('disconnects other devices when the password changes', async () => {
    const other = await identify(app, member.cookie)
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: WEB_ORIGIN },
      payload: { login: 'member', password: 'password123' },
    })
    const current = login.cookies.find((c) => c.name === SESSION_COOKIE)?.value as string

    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password/change',
      headers: { cookie: `${SESSION_COOKIE}=${current}`, origin: WEB_ORIGIN },
      payload: { currentPassword: 'password123', newPassword: 'new-password-1' },
    })

    expect((await other.socket.closed).code).toBe(4004)
  })
})
