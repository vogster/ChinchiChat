import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, events, close } = createTestApp({ env: { RATE_LIMIT: 'off' } })
const PASSWORD = 'password123'

let admin: TestActor
let member: TestActor
let guild: Awaited<ReturnType<typeof createGuild>>
let textId: string

const api = (actor: TestActor, method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: actor.headers,
    ...(payload ? { payload } : {}),
  })

const deleteSelf = (actor: TestActor, password = PASSWORD) =>
  api(actor, 'DELETE', '/users/@me', { password })

beforeEach(async () => {
  await resetState(db, redis)
  // The first account runs the instance.
  admin = await signUp(app, { username: 'admin', email: 'admin@example.com' })
  member = await signUp(app, { username: 'member', email: 'member@example.com' })
  guild = await createGuild(app, admin)
  textId = guild.channels.find((c) => c.type === 'text')?.id as string
  await addMember(db, guild.id, member.id)
})

afterAll(async () => {
  await close()
})

describe('deleting your account', () => {
  it('asks for the password, then signs out everywhere and leaves messages behind', async () => {
    await api(member, 'POST', `/channels/${textId}/messages`, { content: 'Пока всем' })

    const wrong = await deleteSelf(member, 'not-my-password')
    expect(wrong.json().code).toBe('INVALID_CURRENT_PASSWORD')

    events.clear()
    expect((await deleteSelf(member)).statusCode).toBe(204)

    expect((await api(member, 'GET', '/users/@me')).statusCode).toBe(401)
    const history = (await api(admin, 'GET', `/channels/${textId}/messages`)).json().data.messages
    expect(history[0]).toMatchObject({ content: 'Пока всем', author: null })
    expect(events.published).toContainEqual(
      expect.objectContaining({
        type: 'GUILD_MEMBER_REMOVE',
        data: { guildId: guild.id, userId: member.id },
      }),
    )
    const names = (await api(admin, 'GET', `/guilds/${guild.id}/members`)).json().data.members
    expect(names.map((m: { user: { id: string } }) => m.user.id)).not.toContain(member.id)
  })

  it('waits until your servers have another owner or are gone', async () => {
    await createGuild(app, member, 'Мой')
    const refused = await deleteSelf(member)
    expect(refused.statusCode).toBe(400)
    expect(refused.json().code).toBe('OWNS_GUILDS')
  })

  it("takes your bots with you, and isn't for bots", async () => {
    const created = (await api(member, 'POST', '/bots', { username: 'helper_bot' })).json().data
    const asBot = await app.inject({
      method: 'DELETE',
      url: '/api/v1/users/@me',
      headers: { authorization: `Bearer ${created.token}` },
      payload: { password: 'x' },
    })
    expect(asBot.statusCode).toBe(403)

    await deleteSelf(member)
    const botMe = await app.inject({
      method: 'GET',
      url: '/api/v1/users/@me',
      headers: { authorization: `Bearer ${created.token}` },
    })
    expect(botMe.statusCode).toBe(401)
  })
})

describe('instance admins', () => {
  it('delete an account together with the servers it owns', async () => {
    const owned = await createGuild(app, member, 'Спам')

    expect((await api(admin, 'DELETE', `/admin/users/${member.id}`)).statusCode).toBe(204)

    expect((await api(member, 'GET', '/users/@me')).statusCode).toBe(401)
    expect((await api(admin, 'GET', `/guilds/${owned.id}`)).statusCode).toBe(404)
  })

  it("can't delete themselves here, nor leave the instance without an admin", async () => {
    const self = await api(admin, 'DELETE', `/admin/users/${admin.id}`)
    expect(self.json().code).toBe('CANNOT_MODIFY_SELF')

    await api(admin, 'DELETE', `/guilds/${guild.id}`)
    const last = await deleteSelf(admin)
    expect(last.json().code).toBe('LAST_ADMIN')
  })
})
