import { Permission } from '@chinchi/shared'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, close } = createTestApp({ env: { RATE_LIMIT: 'off' } })

let owner: TestActor
let member: TestActor
let guild: Awaited<ReturnType<typeof createGuild>>
let textId: string

const call = (
  actor: TestActor,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT',
  url: string,
  payload?: object,
) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: actor.headers,
    ...(payload ? { payload } : {}),
  })

const send = (actor: TestActor, content: string) =>
  call(actor, 'POST', `/channels/${textId}/messages`, { content })

beforeEach(async () => {
  await resetState(db, redis)
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
  member = await signUp(app, { username: 'member', email: 'member@example.com' })
  guild = await createGuild(app, owner)
  textId = guild.channels.find((c) => c.type === 'text')?.id as string
  await addMember(db, guild.id, member.id)
})

afterAll(async () => {
  await close()
})

describe('channel settings', () => {
  it('stores slowmode and the NSFW flag, off by default', async () => {
    const created = (
      await call(owner, 'POST', `/guilds/${guild.id}/channels`, { type: 'text', name: 'мемы' })
    ).json().data.channel
    expect(created).toMatchObject({ rateLimitPerUser: 0, nsfw: false })

    const updated = await call(owner, 'PATCH', `/channels/${created.id}`, {
      rateLimitPerUser: 30,
      nsfw: true,
    })

    expect(updated.statusCode).toBe(200)
    expect(updated.json().data.channel).toMatchObject({ rateLimitPerUser: 30, nsfw: true })
  })

  it('accepts slowmode up to six hours, on text channels only', async () => {
    const tooSlow = await call(owner, 'PATCH', `/channels/${textId}`, { rateLimitPerUser: 21_601 })
    expect(tooSlow.statusCode).toBe(400)

    const voiceId = guild.channels.find((c) => c.type === 'voice')?.id as string
    const voice = await call(owner, 'PATCH', `/channels/${voiceId}`, { rateLimitPerUser: 10 })
    expect(voice.statusCode).toBe(400)
    expect(voice.json().code).toBe('INVALID_CHANNEL_OPTION')
  })
})

describe('slowmode', () => {
  it('lets each member send one message per interval', async () => {
    await call(owner, 'PATCH', `/channels/${textId}`, { rateLimitPerUser: 60 })

    expect((await send(member, 'первое')).statusCode).toBe(201)
    const second = await send(member, 'второе')
    expect(second.statusCode).toBe(429)
    expect(second.json().code).toBe('SLOWMODE')
  })

  it('does not hold back those who manage messages or the channel', async () => {
    await call(owner, 'PATCH', `/channels/${textId}`, { rateLimitPerUser: 60 })
    const roleId = (
      await call(owner, 'POST', `/guilds/${guild.id}/roles`, {
        name: 'mods',
        permissions: Permission.ManageMessages.toString(),
      })
    ).json().data.role.id
    await call(owner, 'PUT', `/guilds/${guild.id}/members/${member.id}/roles/${roleId}`)

    expect((await send(owner, 'раз')).statusCode).toBe(201)
    expect((await send(owner, 'два')).statusCode).toBe(201)
    expect((await send(member, 'раз')).statusCode).toBe(201)
    expect((await send(member, 'два')).statusCode).toBe(201)
  })

  it('starts everyone afresh when the interval changes', async () => {
    await call(owner, 'PATCH', `/channels/${textId}`, { rateLimitPerUser: 21_600 })
    expect((await send(member, 'раз')).statusCode).toBe(201)

    await call(owner, 'PATCH', `/channels/${textId}`, { rateLimitPerUser: 10 })
    expect((await send(member, 'два')).statusCode).toBe(201)
  })

  it('counts nothing when slowmode is off', async () => {
    expect((await send(member, 'раз')).statusCode).toBe(201)
    expect((await send(member, 'два')).statusCode).toBe(201)
  })
})
