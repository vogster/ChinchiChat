import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, close } = createTestApp({ env: { RATE_LIMIT: 'off' } })

let owner: TestActor
let stranger: TestActor
let guild: Awaited<ReturnType<typeof createGuild>>
let textId: string

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

/** What a bot process does: a bearer token, no cookie, no Origin. */
const asBot = (token: string, method: 'GET' | 'POST', url: string, payload?: object) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { authorization: `Bearer ${token}` },
    ...(payload ? { payload } : {}),
  })

const createBot = async (actor: TestActor = owner, username = 'helper_bot') =>
  (await api(actor, 'POST', '/bots', { username })).json().data as {
    bot: { user: { id: string; username: string; bot?: boolean }; public: boolean }
    token: string
  }

beforeEach(async () => {
  await resetState(db, redis)
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
  stranger = await signUp(app, { username: 'stranger', email: 'stranger@example.com' })
  guild = await createGuild(app, owner)
  textId = guild.channels.find((c) => c.type === 'text')?.id as string
})

afterAll(async () => {
  await close()
})

describe('bots', () => {
  it('are accounts with a token their owner gets once', async () => {
    const created = await api(owner, 'POST', '/bots', { username: 'helper_bot' })
    expect(created.statusCode).toBe(201)
    const { bot, token } = created.json().data
    expect(bot).toMatchObject({ user: { username: 'helper_bot', bot: true }, public: false })
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)

    const me = await asBot(token, 'GET', '/users/@me')
    expect(me.json().data.user).toMatchObject({ id: bot.user.id, bot: true })

    const mine = (await api(owner, 'GET', '/bots')).json().data.bots
    expect(mine).toEqual([
      expect.objectContaining({ user: expect.objectContaining({ id: bot.user.id }) }),
    ])
    expect(JSON.stringify(mine)).not.toContain(token)
  })

  it('join a server when its manager adds them, and then post', async () => {
    const { bot, token } = await createBot()
    const added = await api(owner, 'POST', `/guilds/${guild.id}/bots`, { botId: bot.user.id })
    expect(added.statusCode).toBe(204)

    const posted = await asBot(token, 'POST', `/channels/${textId}/messages`, {
      content: 'Готов к работе',
    })
    expect(posted.statusCode).toBe(201)
    expect(posted.json().data.message.author).toMatchObject({ id: bot.user.id, bot: true })
  })

  it('can be added by others only once made public', async () => {
    const { bot } = await createBot()
    const strangersGuild = await createGuild(app, stranger, 'Чужой')
    const refused = await api(stranger, 'POST', `/guilds/${strangersGuild.id}/bots`, {
      botId: bot.user.id,
    })
    expect(refused.statusCode).toBe(404)
    expect(refused.json().code).toBe('UNKNOWN_BOT')

    await api(owner, 'PATCH', `/bots/${bot.user.id}`, { public: true })
    expect(
      (await api(stranger, 'POST', `/guilds/${strangersGuild.id}/bots`, { botId: bot.user.id }))
        .statusCode,
    ).toBe(204)
  })

  it('get a new token that ends the old one', async () => {
    const { bot, token } = await createBot()
    const renewed = (await api(owner, 'POST', `/bots/${bot.user.id}/token`)).json().data.token
    expect(renewed).not.toBe(token)
    expect((await asBot(token, 'GET', '/users/@me')).statusCode).toBe(401)
    expect((await asBot(renewed, 'GET', '/users/@me')).statusCode).toBe(200)
    expect((await api(stranger, 'POST', `/bots/${bot.user.id}/token`)).statusCode).toBe(404)
  })

  it("can't do what only people do", async () => {
    const { token } = await createBot()
    const guildAttempt = await asBot(token, 'POST', '/guilds', { name: 'Ботский', locale: 'ru' })
    expect(guildAttempt.statusCode).toBe(403)
    expect(guildAttempt.json().code).toBe('BOT_FORBIDDEN')
    const friendAttempt = await asBot(token, 'POST', '/users/@me/relationships', {
      username: 'owner',
    })
    expect(friendAttempt.json().code).toBe('BOT_FORBIDDEN')
  })

  it("can't own servers, run the instance or be messaged directly", async () => {
    const { bot } = await createBot()
    await api(owner, 'POST', `/guilds/${guild.id}/bots`, { botId: bot.user.id })

    const transfer = await api(owner, 'POST', `/guilds/${guild.id}/transfer`, {
      userId: bot.user.id,
    })
    expect(transfer.statusCode).toBe(400)
    expect(transfer.json().code).toBe('BOT_CANNOT_OWN')

    const admin = await api(owner, 'PATCH', `/admin/users/${bot.user.id}`, { admin: true })
    expect(admin.json().code).toBe('BOT_CANNOT_ADMIN')

    const dm = await api(owner, 'POST', '/users/@me/channels', { recipientIds: [bot.user.id] })
    expect(dm.statusCode).toBe(403)
  })

  it('stay out of servers that banned them', async () => {
    const { bot } = await createBot()
    await addMember(db, guild.id, bot.user.id)
    await api(owner, 'PUT', `/guilds/${guild.id}/bans/${bot.user.id}`, {})

    const again = await api(owner, 'POST', `/guilds/${guild.id}/bots`, { botId: bot.user.id })
    expect(again.statusCode).toBe(403)
    expect(again.json().code).toBe('BANNED')
  })

  it('stop working while their owner is suspended', async () => {
    const other = await signUp(app, { username: 'other', email: 'other@example.com' })
    const { token } = await createBot(other)
    expect((await asBot(token, 'GET', '/users/@me')).statusCode).toBe(200)

    await api(owner, 'PATCH', `/admin/users/${other.id}`, { suspended: true })
    expect((await asBot(token, 'GET', '/users/@me')).statusCode).toBe(401)

    await api(owner, 'PATCH', `/admin/users/${other.id}`, { suspended: false })
    expect((await asBot(token, 'GET', '/users/@me')).statusCode).toBe(200)
  })

  it('leave every server when deleted', async () => {
    const { bot, token } = await createBot()
    await addMember(db, guild.id, bot.user.id)
    expect((await api(owner, 'DELETE', `/bots/${bot.user.id}`)).statusCode).toBe(204)
    expect((await asBot(token, 'GET', '/users/@me')).statusCode).toBe(401)
    const members = (await api(owner, 'GET', `/guilds/${guild.id}/members`)).json().data.members
    expect(members.map((m: { user: { id: string } }) => m.user.id)).not.toContain(bot.user.id)
  })
})
