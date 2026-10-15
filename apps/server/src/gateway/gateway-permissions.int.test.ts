import { Permission } from '@chinchi/shared'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { identify } from '../../test/gateway-client'
import { addMember, createGuild, signUp } from '../../test/guild-helpers'
import { createTestApp, resetState } from '../../test/test-app'

import type { Frame, TestSocket } from '../../test/gateway-client'
import type { TestActor } from '../../test/guild-helpers'

const { app, db, redis, close } = createTestApp()
const sockets: TestSocket[] = []

let owner: TestActor
let member: TestActor
let guild: Awaited<ReturnType<typeof createGuild>>
let privateId: string
let staffId: string

const VIEW = String(Permission.ViewChannel)

const call = (actor: TestActor, method: 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: actor.headers,
    ...(payload ? { payload } : {}),
  })

const connect = async (actor: TestActor) => {
  const result = await identify(app, actor.cookie)
  sockets.push(result.socket)
  return result
}

/** The first dispatch of `type` after the first `mark` frames. */
const after = (socket: TestSocket, mark: number, type: string) =>
  socket.next((frame: Frame) => frame.t === type && socket.frames.indexOf(frame) >= mark)

beforeAll(async () => {
  await app.listen({ host: '127.0.0.1', port: 0 })
})

beforeEach(async () => {
  await resetState(db, redis)
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
  member = await signUp(app, { username: 'member', email: 'member@example.com' })
  guild = await createGuild(app, owner)
  await addMember(db, guild.id, member.id)

  staffId = (await call(owner, 'POST', `/guilds/${guild.id}/roles`, { name: 'Staff' })).json().data
    .role.id
  privateId = (
    await call(owner, 'POST', `/guilds/${guild.id}/channels`, { type: 'text', name: 'staff-only' })
  ).json().data.channel.id
  await call(owner, 'PUT', `/channels/${privateId}/permissions/${guild.id}`, {
    targetType: 'role',
    allow: '0',
    deny: VIEW,
  })
  await call(owner, 'PUT', `/channels/${privateId}/permissions/${staffId}`, {
    targetType: 'role',
    allow: VIEW,
    deny: '0',
  })
})

afterEach(() => {
  for (const socket of sockets.splice(0)) socket.close()
})

afterAll(async () => {
  await close()
})

describe('gateway permissions', () => {
  it('leaves hidden channels out of READY', async () => {
    const { ready } = await connect(member)
    const channelIds = (ready.guilds[0] as unknown as { channels: { id: string }[] }).channels.map(
      (c) => c.id,
    )
    expect(channelIds).not.toContain(privateId)
  })

  it('does not deliver messages or typing from channels the user cannot see', async () => {
    const { socket } = await connect(member)

    await call(owner, 'POST', `/channels/${privateId}/typing`)
    await call(owner, 'POST', `/channels/${privateId}/messages`, { content: 'secret plans' })
    await call(
      owner,
      'POST',
      `/channels/${guild.channels.find((c) => c.type === 'text')?.id}/messages`,
      { content: 'public' },
    )

    const delivered = await socket.dispatch<{ content: string }>('MESSAGE_CREATE')
    expect(delivered.content).toBe('public')
    expect(socket.frames.some((f) => JSON.stringify(f.d ?? '').includes('secret plans'))).toBe(
      false,
    )
    expect(socket.frames.some((f) => f.t === 'TYPING_START')).toBe(false)
  })

  it('reveals the channel when the user gets the role, and hides it again when it is removed', async () => {
    const { socket } = await connect(member)

    let mark = socket.frames.length
    await call(owner, 'PUT', `/guilds/${guild.id}/members/${member.id}/roles/${staffId}`)
    const revealed = await after(socket, mark, 'CHANNEL_CREATE')
    expect(revealed.d).toMatchObject({ id: privateId, name: 'staff-only' })

    await call(owner, 'POST', `/channels/${privateId}/messages`, { content: 'welcome to staff' })
    expect((await after(socket, mark, 'MESSAGE_CREATE')).d).toMatchObject({
      content: 'welcome to staff',
    })

    mark = socket.frames.length
    await call(owner, 'DELETE', `/guilds/${guild.id}/members/${member.id}/roles/${staffId}`)
    expect((await after(socket, mark, 'CHANNEL_DELETE')).d).toEqual({
      id: privateId,
      guildId: guild.id,
    })
  })

  it('tells members a channel disappeared when an overwrite hides it from them', async () => {
    const publicId = guild.channels.find((c) => c.type === 'text')?.id as string
    const { socket } = await connect(member)
    const mark = socket.frames.length

    await call(owner, 'PUT', `/channels/${publicId}/permissions/${member.id}`, {
      targetType: 'member',
      allow: '0',
      deny: VIEW,
    })

    expect((await after(socket, mark, 'CHANNEL_DELETE')).d).toEqual({
      id: publicId,
      guildId: guild.id,
    })
  })

  it('shows everything to the owner', async () => {
    const { ready, socket } = await connect(owner)
    const channelIds = (ready.guilds[0] as unknown as { channels: { id: string }[] }).channels.map(
      (c) => c.id,
    )
    expect(channelIds).toContain(privateId)

    await call(
      member,
      'POST',
      `/channels/${guild.channels.find((c) => c.type === 'text')?.id}/typing`,
    )
    await socket.dispatch('TYPING_START')
  })
})
