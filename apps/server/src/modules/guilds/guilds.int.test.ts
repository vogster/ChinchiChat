import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, close } = createTestApp()

let owner: TestActor
let member: TestActor
let outsider: TestActor

const call = (
  actor: TestActor | null,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: actor?.headers ?? {},
    ...(payload ? { payload } : {}),
  })

beforeEach(async () => {
  await resetState(db, redis)
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
  member = await signUp(app, { username: 'member', email: 'member@example.com' })
  outsider = await signUp(app, { username: 'outsider', email: 'outsider@example.com' })
})

afterAll(async () => {
  await close()
})

describe('POST /api/v1/guilds', () => {
  it('creates a server owned by the caller with default channels', async () => {
    const response = await call(owner, 'POST', '/guilds', { name: '  Gamers ', locale: 'en' })

    expect(response.statusCode).toBe(201)
    const guild = response.json().data.guild
    expect(guild).toMatchObject({ name: 'Gamers', ownerId: owner.id })

    const byName = Object.fromEntries(guild.channels.map((c: { name: string }) => [c.name, c]))
    expect(byName['Text Channels']).toMatchObject({ type: 'category', parentId: null })
    expect(byName['general']).toMatchObject({ type: 'text', parentId: byName['Text Channels'].id })
    expect(byName['Voice Channels']).toMatchObject({ type: 'category' })
    expect(byName['General']).toMatchObject({
      type: 'voice',
      parentId: byName['Voice Channels'].id,
    })
  })

  it('names default channels in the requested language', async () => {
    const guild = await createGuild(app, owner, 'Сервер', 'ru')

    expect(guild.channels.map((c) => c.name).sort()).toEqual(
      ['Голосовые каналы', 'Общий', 'Текстовые каналы', 'общий'].sort(),
    )
  })

  it('validates the name', async () => {
    const response = await call(owner, 'POST', '/guilds', { name: 'x' })
    expect(response.json()).toMatchObject({ code: 'VALIDATION_FAILED' })
  })

  it('requires authentication', async () => {
    expect((await call(null, 'POST', '/guilds', { name: 'Gamers' })).statusCode).toBe(401)
  })
})

describe('GET /api/v1/users/@me/guilds', () => {
  it('lists only servers the user belongs to, oldest first', async () => {
    const first = await createGuild(app, owner, 'First')
    const second = await createGuild(app, owner, 'Second')
    await createGuild(app, outsider, 'Not mine')
    await addMember(db, second.id, member.id)

    const ownerList = (await call(owner, 'GET', '/users/@me/guilds')).json().data.guilds
    const memberList = (await call(member, 'GET', '/users/@me/guilds')).json().data.guilds

    expect(ownerList.map((g: { id: string }) => g.id)).toEqual([first.id, second.id])
    expect(memberList.map((g: { name: string }) => g.name)).toEqual(['Second'])
  })
})

describe('GET /api/v1/guilds/:id', () => {
  it('returns the server with channels to members', async () => {
    const guild = await createGuild(app, owner)
    await addMember(db, guild.id, member.id)

    const response = await call(member, 'GET', `/guilds/${guild.id}`)

    expect(response.statusCode).toBe(200)
    expect(response.json().data.guild.channels).toHaveLength(4)
  })

  it('hides servers from non-members', async () => {
    const guild = await createGuild(app, owner)

    const response = await call(outsider, 'GET', `/guilds/${guild.id}`)

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ code: 'UNKNOWN_GUILD' })
  })

  it('answers 404 for servers that do not exist', async () => {
    expect((await call(owner, 'GET', '/guilds/123')).statusCode).toBe(404)
  })

  it('validates the id', async () => {
    expect((await call(owner, 'GET', '/guilds/abc')).statusCode).toBe(400)
  })
})

describe('PATCH /api/v1/guilds/:id', () => {
  it('lets the owner rename the server', async () => {
    const guild = await createGuild(app, owner)

    const response = await call(owner, 'PATCH', `/guilds/${guild.id}`, { name: 'Renamed' })

    expect(response.statusCode).toBe(200)
    expect(response.json().data.guild.name).toBe('Renamed')
  })

  it('forbids members who are not the owner', async () => {
    const guild = await createGuild(app, owner)
    await addMember(db, guild.id, member.id)

    const response = await call(member, 'PATCH', `/guilds/${guild.id}`, { name: 'Hijacked' })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toMatchObject({ code: 'MISSING_PERMISSIONS' })
  })

  it('does not reveal the server to outsiders', async () => {
    const guild = await createGuild(app, owner)
    const response = await call(outsider, 'PATCH', `/guilds/${guild.id}`, { name: 'Nope' })
    expect(response.statusCode).toBe(404)
  })
})

describe('DELETE /api/v1/guilds/:id', () => {
  it('lets the owner delete the server with everything in it', async () => {
    const guild = await createGuild(app, owner)
    await addMember(db, guild.id, member.id)

    expect((await call(owner, 'DELETE', `/guilds/${guild.id}`)).statusCode).toBe(204)
    expect((await call(member, 'GET', `/guilds/${guild.id}`)).statusCode).toBe(404)
    expect((await call(member, 'GET', '/users/@me/guilds')).json().data.guilds).toEqual([])
  })

  it('forbids non-owners', async () => {
    const guild = await createGuild(app, owner)
    await addMember(db, guild.id, member.id)

    expect((await call(member, 'DELETE', `/guilds/${guild.id}`)).statusCode).toBe(403)
  })
})

describe('POST /api/v1/guilds/:id/transfer', () => {
  it('hands ownership to another member', async () => {
    const guild = await createGuild(app, owner)
    await addMember(db, guild.id, member.id)

    const response = await call(owner, 'POST', `/guilds/${guild.id}/transfer`, {
      userId: member.id,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().data.guild.ownerId).toBe(member.id)
    const asOldOwner = await call(owner, 'PATCH', `/guilds/${guild.id}`, { name: 'Mine?' })
    const asNewOwner = await call(member, 'PATCH', `/guilds/${guild.id}`, { name: 'Mine!' })
    expect(asOldOwner.statusCode).toBe(403)
    expect(asNewOwner.statusCode).toBe(200)
  })

  it('only transfers to members', async () => {
    const guild = await createGuild(app, owner)

    const response = await call(owner, 'POST', `/guilds/${guild.id}/transfer`, {
      userId: outsider.id,
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ code: 'UNKNOWN_MEMBER' })
  })

  it('forbids non-owners', async () => {
    const guild = await createGuild(app, owner)
    await addMember(db, guild.id, member.id)

    const response = await call(member, 'POST', `/guilds/${guild.id}/transfer`, {
      userId: member.id,
    })
    expect(response.statusCode).toBe(403)
  })
})

describe('members', () => {
  it('lists members with public profiles', async () => {
    const guild = await createGuild(app, owner)
    await addMember(db, guild.id, member.id)

    const response = await call(member, 'GET', `/guilds/${guild.id}/members`)

    expect(response.statusCode).toBe(200)
    const members = response.json().data.members
    expect(members.map((m: { user: { username: string } }) => m.user.username)).toEqual([
      'owner',
      'member',
    ])
    expect(members[0].user).not.toHaveProperty('email')
  })

  it('hides the member list from outsiders', async () => {
    const guild = await createGuild(app, owner)
    expect((await call(outsider, 'GET', `/guilds/${guild.id}/members`)).statusCode).toBe(404)
  })

  it('lets a member leave', async () => {
    const guild = await createGuild(app, owner)
    await addMember(db, guild.id, member.id)

    expect((await call(member, 'DELETE', `/guilds/${guild.id}/members/@me`)).statusCode).toBe(204)
    expect((await call(member, 'GET', `/guilds/${guild.id}`)).statusCode).toBe(404)
  })

  it('does not let the owner leave without transferring ownership', async () => {
    const guild = await createGuild(app, owner)

    const response = await call(owner, 'DELETE', `/guilds/${guild.id}/members/@me`)

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ code: 'OWNER_CANNOT_LEAVE' })
  })
})
