import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, events, close } = createTestApp({ env: { RATE_LIMIT: 'off' } })

let alice: TestActor
let bob: TestActor
let carol: TestActor
let dave: TestActor
let guildId: string

const api = (
  actor: TestActor,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH',
  url: string,
  payload?: object,
) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: actor.headers,
    ...(payload ? { payload } : {}),
  })

const profileOf = (viewer: TestActor, target: TestActor, query = '') =>
  api(viewer, 'GET', `/users/${target.id}/profile${query}`)

beforeEach(async () => {
  await resetState(db, redis)
  alice = await signUp(app, { username: 'alice', email: 'alice@example.com' })
  bob = await signUp(app, { username: 'bob', email: 'bob@example.com' })
  carol = await signUp(app, { username: 'carol', email: 'carol@example.com' })
  dave = await signUp(app, { username: 'dave', email: 'dave@example.com' })
  // Alice and Bob share a server; Carol is a friend of both, sharing no server; Dave is nobody.
  guildId = (await createGuild(app, alice)).id
  await addMember(db, guildId, bob.id)
  for (const friend of [alice, bob]) {
    await api(friend, 'POST', '/users/@me/relationships', { username: 'carol' })
    await api(carol, 'PUT', `/users/@me/relationships/${friend.id}`, { type: 'friend' })
  }
  events.clear()
})

afterAll(async () => {
  await close()
})

describe('about me', () => {
  it('is set in the profile, trimmed, and cleared when empty', async () => {
    const set = await api(alice, 'PATCH', '/users/@me', { bio: '  Рисую котиков 🐈 ' })
    expect(set.json().data.user.bio).toBe('Рисую котиков 🐈')

    const cleared = await api(alice, 'PATCH', '/users/@me', { bio: '' })
    expect(cleared.json().data.user.bio).toBeNull()
  })
})

describe('GET /users/:id/profile', () => {
  it('shows a server mate the profile, what they share and their membership', async () => {
    await api(bob, 'PATCH', '/users/@me', { bio: 'Привет!' })

    const response = await profileOf(alice, bob, `?guildId=${guildId}`)

    expect(response.statusCode).toBe(200)
    expect(response.json().data.profile).toMatchObject({
      user: { id: bob.id, username: 'bob' },
      bio: 'Привет!',
      relationship: null,
      mutualGuildIds: [guildId],
      mutualFriends: [expect.objectContaining({ id: carol.id })],
      member: { nickname: null, roleIds: [], joinedAt: expect.any(String) },
    })
  })

  it('shows friends to each other without a shared server, with no membership', async () => {
    const response = await profileOf(carol, alice, `?guildId=${guildId}`)

    expect(response.json().data.profile).toMatchObject({
      relationship: 'friend',
      mutualGuildIds: [],
      member: null,
    })
  })

  it('answers 404 to strangers and to people the user blocked', async () => {
    expect((await profileOf(dave, alice)).statusCode).toBe(404)

    await api(bob, 'PUT', `/users/@me/relationships/${alice.id}`, { type: 'blocked' })
    const blocked = await profileOf(alice, bob)
    expect(blocked.statusCode).toBe(404)
    expect(blocked.json().code).toBe('UNKNOWN_USER')
    // The one who blocked still sees whom they blocked.
    expect((await profileOf(bob, alice)).json().data.profile.relationship).toBe('blocked')
  })

  it('stays hidden from strangers who block or ask first: only the other side opens it', async () => {
    await api(dave, 'PUT', `/users/@me/relationships/${alice.id}`, { type: 'blocked' })
    expect((await profileOf(dave, alice)).statusCode).toBe(404)

    await api(dave, 'POST', '/users/@me/relationships', { username: 'bob' })
    expect((await profileOf(dave, bob)).statusCode).toBe(404)
    // Bob sees who asked him, so he can decide.
    expect((await profileOf(bob, dave)).json().data.profile.relationship).toBe('pending_in')
  })

  it('always shows the user their own profile', async () => {
    expect((await profileOf(dave, dave)).statusCode).toBe(200)
  })
})

describe('server nicknames', () => {
  const nickname = (actor: TestActor, target: TestActor, value: string | null) =>
    api(actor, 'PATCH', `/guilds/${guildId}/members/${target.id}`, { nickname: value })

  it('lets members set their own, announced and listed', async () => {
    const response = await nickname(bob, bob, '  Бобр  ')

    expect(response.statusCode).toBe(200)
    expect(response.json().data.member.nickname).toBe('Бобр')
    expect(events.published).toContainEqual(
      expect.objectContaining({
        topic: `guild:${guildId}`,
        type: 'GUILD_MEMBER_UPDATE',
        data: { guildId, userId: bob.id, roleIds: [], nickname: 'Бобр', timeoutUntil: null },
      }),
    )
    const members = (await api(alice, 'GET', `/guilds/${guildId}/members`)).json().data.members
    expect(members.find((m: { user: { id: string } }) => m.user.id === bob.id).nickname).toBe(
      'Бобр',
    )
    expect((await nickname(bob, bob, '')).json().data.member.nickname).toBeNull()
  })

  it('needs MANAGE_NICKNAMES (and a higher role) for someone else', async () => {
    expect((await nickname(alice, bob, 'Боб-строитель')).statusCode).toBe(200)

    const refused = await nickname(bob, alice, 'Хозяйка')
    expect(refused.statusCode).toBe(403)
  })
})
