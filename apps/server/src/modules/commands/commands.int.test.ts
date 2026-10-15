import { Permission } from '@chinchi/shared'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, events, close } = createTestApp({ env: { RATE_LIMIT: 'off' } })

let owner: TestActor
let member: TestActor
let guild: Awaited<ReturnType<typeof createGuild>>
let textId: string
let bot: { id: string; token: string }

const api = (
  actor: TestActor,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH',
  url: string,
  payload?: unknown,
) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: actor.headers,
    ...(payload !== undefined ? { payload: payload as object } : {}),
  })

const asBot = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { authorization: `Bearer ${bot.token}` },
    ...(payload !== undefined ? { payload: payload as object } : {}),
  })

const ROLL = {
  name: 'roll',
  description: 'Бросить кубик',
  options: [{ name: 'sides', description: 'Граней', required: true }],
}

const commandsHere = async (actor: TestActor) =>
  (await api(actor, 'GET', `/guilds/${guild.id}/commands`)).json().data.commands as {
    id: string
    name: string
    bot: { id: string }
  }[]

const lastInteraction = () => {
  const event = events.published.findLast((e) => e.type === 'INTERACTION_CREATE')
  return event as {
    topic: string
    data: { id: string; token: string; options: object; user: { id: string } }
  }
}

beforeEach(async () => {
  await resetState(db, redis)
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
  member = await signUp(app, { username: 'member', email: 'member@example.com' })
  guild = await createGuild(app, owner)
  textId = guild.channels.find((c) => c.type === 'text')?.id as string
  await addMember(db, guild.id, member.id)
  const created = (await api(owner, 'POST', '/bots', { username: 'dice_bot' })).json().data
  bot = { id: created.bot.user.id, token: created.token }
  await api(owner, 'POST', `/guilds/${guild.id}/bots`, { botId: bot.id })
  events.clear()
})

afterAll(async () => {
  await close()
})

describe('registering commands', () => {
  it('is for bots, which replace their whole list', async () => {
    const put = await asBot('PUT', '/bots/@me/commands', [ROLL])
    expect(put.statusCode).toBe(200)
    expect(put.json().data.commands).toEqual([
      expect.objectContaining({ name: 'roll', bot: expect.objectContaining({ id: bot.id }) }),
    ])

    expect((await api(member, 'PUT', '/bots/@me/commands', [ROLL])).statusCode).toBe(403)
    expect(await commandsHere(member)).toEqual([expect.objectContaining({ name: 'roll' })])

    await asBot('PUT', '/bots/@me/commands', [])
    expect(await commandsHere(member)).toEqual([])
  })
})

describe('running a command', () => {
  it('reaches the bot, which answers once in the channel', async () => {
    await asBot('PUT', '/bots/@me/commands', [ROLL])
    const [command] = await commandsHere(member)

    const invoked = await api(member, 'POST', `/channels/${textId}/interactions`, {
      commandId: command?.id,
      options: { sides: '20' },
    })
    expect(invoked.statusCode).toBe(204)
    const interaction = lastInteraction()
    expect(interaction.topic).toBe(`user:${bot.id}`)
    expect(interaction.data).toMatchObject({ options: { sides: '20' }, user: { id: member.id } })

    const forged = await app.inject({
      method: 'POST',
      url: `/api/v1/interactions/${interaction.data.id}/${'x'.repeat(43)}/callback`,
      payload: { content: 'Подделка' },
    })
    expect(forged.json().code).toBe('UNKNOWN_INTERACTION')

    const answer = await app.inject({
      method: 'POST',
      url: `/api/v1/interactions/${interaction.data.id}/${interaction.data.token}/callback`,
      payload: { content: 'Выпало 17' },
    })
    expect(answer.statusCode).toBe(201)
    expect(answer.json().data.message).toMatchObject({
      content: 'Выпало 17',
      author: { id: bot.id, bot: true },
      interaction: { name: 'roll', user: { id: member.id } },
    })

    const again = await app.inject({
      method: 'POST',
      url: `/api/v1/interactions/${interaction.data.id}/${interaction.data.token}/callback`,
      payload: { content: 'Ещё раз' },
    })
    expect(again.statusCode).toBe(404)
    expect(again.json().code).toBe('UNKNOWN_INTERACTION')
  })

  it('checks options and who may write in the channel', async () => {
    await asBot('PUT', '/bots/@me/commands', [ROLL])
    const [command] = await commandsHere(member)

    const missing = await api(member, 'POST', `/channels/${textId}/interactions`, {
      commandId: command?.id,
    })
    expect(missing.json().code).toBe('INVALID_COMMAND_OPTIONS')
    const unknown = await api(member, 'POST', `/channels/${textId}/interactions`, {
      commandId: command?.id,
      options: { sides: '6', color: 'red' },
    })
    expect(unknown.json().code).toBe('INVALID_COMMAND_OPTIONS')

    await api(owner, 'PUT', `/channels/${textId}/permissions/${member.id}`, {
      targetType: 'member',
      allow: '0',
      deny: Permission.SendMessages.toString(),
    })
    const muted = await api(member, 'POST', `/channels/${textId}/interactions`, {
      commandId: command?.id,
      options: { sides: '6' },
    })
    expect(muted.statusCode).toBe(403)
  })

  it("doesn't run commands of bots that aren't on the server", async () => {
    await asBot('PUT', '/bots/@me/commands', [ROLL])
    const [command] = await commandsHere(member)
    await api(owner, 'POST', `/guilds/${guild.id}/members/${bot.id}/kick`, {})

    const response = await api(member, 'POST', `/channels/${textId}/interactions`, {
      commandId: command?.id,
      options: { sides: '6' },
    })
    expect(response.statusCode).toBe(404)
    expect(response.json().code).toBe('UNKNOWN_COMMAND')
  })

  it("drops the answer once the bot can't post there", async () => {
    await asBot('PUT', '/bots/@me/commands', [ROLL])
    const [command] = await commandsHere(member)
    await api(member, 'POST', `/channels/${textId}/interactions`, {
      commandId: command?.id,
      options: { sides: '6' },
    })
    const { data } = lastInteraction()
    await api(owner, 'POST', `/guilds/${guild.id}/members/${bot.id}/kick`, {})

    const answer = await app.inject({
      method: 'POST',
      url: `/api/v1/interactions/${data.id}/${data.token}/callback`,
      payload: { content: 'Поздно' },
    })
    expect(answer.json().code).toBe('UNKNOWN_INTERACTION')
  })

  it("isn't run where the bot can't answer", async () => {
    await asBot('PUT', '/bots/@me/commands', [ROLL])
    const [command] = await commandsHere(member)
    await api(owner, 'PUT', `/channels/${textId}/permissions/${bot.id}`, {
      targetType: 'member',
      allow: '0',
      deny: Permission.SendMessages.toString(),
    })

    const response = await api(member, 'POST', `/channels/${textId}/interactions`, {
      commandId: command?.id,
      options: { sides: '6' },
    })
    expect(response.statusCode).toBe(403)
    expect(response.json().code).toBe('BOT_MISSING_ACCESS')
  })

  it('waits its turn in slowmode', async () => {
    await asBot('PUT', '/bots/@me/commands', [ROLL])
    const [command] = await commandsHere(member)
    await api(owner, 'PATCH', `/channels/${textId}`, { rateLimitPerUser: 60 })
    const run = () =>
      api(member, 'POST', `/channels/${textId}/interactions`, {
        commandId: command?.id,
        options: { sides: '6' },
      })

    expect((await run()).statusCode).toBe(204)
    expect((await run()).json().code).toBe('SLOWMODE')
  })
})
