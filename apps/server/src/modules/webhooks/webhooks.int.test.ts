import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'
import { webhooks } from '../../db/schema'

import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, events, close } = createTestApp({
  env: { RATE_LIMIT: 'off', PUBLIC_URL: 'https://chat.example.com' },
})
// Limits on: someone guessing tokens must not block the real integration.
const limited = createTestApp({ env: { PUBLIC_URL: 'https://chat.example.com' } })

let owner: TestActor
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

/** What a CI server or a script does: no session, no Origin. */
const execute = (url: string, payload: object, target = app) =>
  target.inject({ method: 'POST', url: url.replace('https://chat.example.com', ''), payload })

const create = async (name = 'Сборки') =>
  (await api(owner, 'POST', `/channels/${textId}/webhooks`, { name })).json().data as {
    webhook: { id: string; name: string }
    url: string
  }

beforeEach(async () => {
  await resetState(db, redis)
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
  member = await signUp(app, { username: 'member', email: 'member@example.com' })
  guild = await createGuild(app, owner)
  textId = guild.channels.find((c) => c.type === 'text')?.id as string
  await addMember(db, guild.id, member.id)
  events.clear()
})

afterAll(async () => {
  await Promise.all([close(), limited.close()])
})

describe('managing webhooks', () => {
  it('are created by those who manage the channel; the secret URL is shown once', async () => {
    const created = await api(owner, 'POST', `/channels/${textId}/webhooks`, { name: 'Сборки' })
    expect(created.statusCode).toBe(201)
    const { webhook, url } = created.json().data
    expect(webhook).toMatchObject({ name: 'Сборки', channelId: textId, guildId: guild.id })
    expect(url).toMatch(
      new RegExp(`^https://chat\\.example\\.com/api/v1/webhooks/${webhook.id}/[A-Za-z0-9_-]{43}$`),
    )

    const listed = (await api(owner, 'GET', `/channels/${textId}/webhooks`)).json().data.webhooks
    expect(listed).toEqual([
      expect.objectContaining({
        id: webhook.id,
        createdBy: expect.objectContaining({ id: owner.id }),
      }),
    ])
    expect(JSON.stringify(listed)).not.toContain(url.split('/').at(-1))

    // Only a hash of the token is kept.
    const [row] = await db.select().from(webhooks)
    expect(row?.tokenHash).not.toBe(url.split('/').at(-1))

    expect(
      (await api(member, 'POST', `/channels/${textId}/webhooks`, { name: 'Нет' })).statusCode,
    ).toBe(403)
    expect((await api(member, 'GET', `/channels/${textId}/webhooks`)).statusCode).toBe(403)
  })

  it('are deleted, after which their URL stops working', async () => {
    const { webhook, url } = await create()
    expect((await api(owner, 'DELETE', `/webhooks/${webhook.id}`)).statusCode).toBe(204)
    expect((await execute(url, { content: 'привет' })).statusCode).toBe(404)
  })
})

describe('posting through a webhook', () => {
  it('stops once its creator is no longer on the server', async () => {
    const managers = (
      await api(owner, 'POST', `/guilds/${guild.id}/roles`, {
        name: 'ops',
        permissions: (1n << 4n).toString(),
      })
    ).json().data.role as { id: string }
    await app.inject({
      method: 'PUT',
      url: `/api/v1/guilds/${guild.id}/members/${member.id}/roles/${managers.id}`,
      headers: owner.headers,
    })
    const created = (
      await api(member, 'POST', `/channels/${textId}/webhooks`, { name: 'Мой' })
    ).json().data as { url: string }
    expect((await execute(created.url, { content: 'пока ещё тут' })).statusCode).toBe(204)

    await api(owner, 'POST', `/guilds/${guild.id}/members/${member.id}/kick`, {})

    expect((await execute(created.url, { content: 'уже нет' })).statusCode).toBe(404)
  })

  it('needs only the URL and shows the webhook as the author', async () => {
    const { webhook, url } = await create()

    const posted = await execute(url, { content: 'Сборка №42 прошла', username: 'CI' })
    expect(posted.statusCode).toBe(204)

    const [message] = (await api(member, 'GET', `/channels/${textId}/messages`)).json().data
      .messages
    expect(message).toMatchObject({
      content: 'Сборка №42 прошла',
      author: null,
      webhook: { id: webhook.id, name: 'CI' },
    })
    expect(events.published).toContainEqual(
      expect.objectContaining({
        type: 'MESSAGE_CREATE',
        data: expect.objectContaining({ content: 'Сборка №42 прошла' }),
      }),
    )
  })

  it('uses its own name by default and never pings everyone', async () => {
    const { url } = await create('Мониторинг')
    await execute(url, { content: '@everyone сервер упал' })

    const [message] = (await api(member, 'GET', `/channels/${textId}/messages`)).json().data
      .messages
    expect(message.webhook.name).toBe('Мониторинг')
    expect(message.mentions.everyone).toBe(false)
  })

  it('refuses a wrong token and an empty message', async () => {
    const { webhook, url } = await create()
    const wrong = await execute(`/api/v1/webhooks/${webhook.id}/${'x'.repeat(43)}`, {
      content: 'x',
    })
    expect(wrong.statusCode).toBe(404)
    expect(wrong.json().code).toBe('UNKNOWN_WEBHOOK')
    expect((await execute(url, { content: '' })).statusCode).toBe(400)
    expect((await execute(url, { content: '  \n ' })).statusCode).toBe(400)
  })

  it("isn't blocked by someone hammering it with wrong tokens", async () => {
    await resetState(limited.db, limited.redis)
    const boss = await signUp(limited.app, { username: 'boss', email: 'boss@example.com' })
    const server = await createGuild(limited.app, boss)
    const channelId = server.channels.find((c) => c.type === 'text')?.id as string
    const { webhook, url } = (
      await limited.app.inject({
        method: 'POST',
        url: `/api/v1/channels/${channelId}/webhooks`,
        headers: boss.headers,
        payload: { name: 'CI' },
      })
    ).json().data
    for (let i = 0; i < 31; i += 1) {
      await execute(
        `/api/v1/webhooks/${webhook.id}/${'x'.repeat(43)}`,
        { content: 'x' },
        limited.app,
      )
    }
    expect((await execute(url, { content: 'настоящий' }, limited.app)).statusCode).toBe(204)
  })

  it('records creation and deletion in the audit log', async () => {
    const { webhook } = await create('Сборки')
    await api(owner, 'DELETE', `/webhooks/${webhook.id}`)
    const actions = (await api(owner, 'GET', `/guilds/${guild.id}/audit-log`))
      .json()
      .data.entries.map((e: { action: string }) => e.action)
    expect(actions.slice(0, 2)).toEqual(['webhook_delete', 'webhook_create'])
  })
})
