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

const call = (actor: TestActor, method: 'GET' | 'PUT' | 'POST', url: string, payload?: object) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: actor.headers,
    ...(payload ? { payload } : {}),
  })

const put = (actor: TestActor, targetId: string, body: object) =>
  call(actor, 'PUT', `/users/@me/notification-settings/${targetId}`, body)

const list = async (actor: TestActor) =>
  (await call(actor, 'GET', '/users/@me/notification-settings')).json().data
    .notificationSettings as unknown[]

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

describe('notification settings', () => {
  it('sets a server level and a timed channel mute, merging changes', async () => {
    const level = await put(member, guild.id, { level: 'mentions' })
    expect(level.statusCode).toBe(200)
    expect(level.json().data.setting).toEqual({
      targetId: guild.id,
      level: 'mentions',
      muted: false,
      mutedUntil: null,
    })

    const until = new Date(Date.now() + 3_600_000).toISOString()
    await put(member, textId, { muted: true, mutedUntil: until })
    const merged = await put(member, textId, { level: 'none' })
    expect(merged.json().data.setting).toEqual({
      targetId: textId,
      level: 'none',
      muted: true,
      mutedUntil: until,
    })

    expect(await list(member)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetId: guild.id, level: 'mentions' }),
        expect.objectContaining({ targetId: textId, muted: true }),
      ]),
    )
    expect(await list(owner)).toEqual([])
  })

  it('unmuting clears the end time; back to defaults removes the setting', async () => {
    await put(member, textId, {
      muted: true,
      mutedUntil: new Date(Date.now() + 60_000).toISOString(),
    })

    const unmuted = await put(member, textId, { muted: false })
    expect(unmuted.json().data.setting).toMatchObject({ muted: false, mutedUntil: null })
    expect(await list(member)).toEqual([])
  })

  it('works for DMs', async () => {
    const dm = (
      await call(owner, 'POST', '/users/@me/channels', { recipientIds: [member.id] })
    ).json().data.channel as { id: string }

    expect((await put(member, dm.id, { muted: true })).statusCode).toBe(200)
  })

  it('reaches the user’s other devices and the next READY', async () => {
    const otherDevice = (await identify(app, member.cookie)).socket
    sockets.push(otherDevice)

    await put(member, guild.id, { muted: true })

    expect(await otherDevice.dispatch('NOTIFICATION_SETTINGS_UPDATE')).toEqual({
      targetId: guild.id,
      setting: { targetId: guild.id, level: null, muted: true, mutedUntil: null },
    })
    const { ready, socket } = await identify(app, member.cookie)
    sockets.push(socket)
    expect(ready.notificationSettings).toEqual([
      { targetId: guild.id, level: null, muted: true, mutedUntil: null },
    ])
  })

  it('hides servers and channels the user cannot see', async () => {
    expect((await put(outsider, guild.id, { muted: true })).json().code).toBe('UNKNOWN_GUILD')
    expect((await put(outsider, textId, { muted: true })).json().code).toBe('UNKNOWN_CHANNEL')
    expect((await put(member, '123456789', { muted: true })).statusCode).toBe(404)
  })

  it('rejects mute ends in the past and bad bodies', async () => {
    const past = await put(member, textId, {
      muted: true,
      mutedUntil: new Date(Date.now() - 60_000).toISOString(),
    })
    expect(past.statusCode).toBe(400)
    expect((await put(member, textId, {})).statusCode).toBe(400)
    expect((await put(member, textId, { level: 'loud' })).statusCode).toBe(400)
  })
})
