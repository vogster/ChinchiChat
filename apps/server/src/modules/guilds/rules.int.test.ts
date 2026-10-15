import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, events, close } = createTestApp()

let owner: TestActor
let member: TestActor
let newcomer: TestActor
let guild: Awaited<ReturnType<typeof createGuild>>
let textId: string

const call = (actor: TestActor, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: actor.headers,
    ...(payload ? { payload } : {}),
  })

const setRules = (rules: string | null) => call(owner, 'PATCH', `/guilds/${guild.id}`, { rules })

const join = async (actor: TestActor) => {
  const invite = (await call(owner, 'POST', `/channels/${textId}/invites`, {})).json().data.invite
  return call(actor, 'POST', `/invites/${invite.code}`)
}

const detail = async (actor: TestActor) =>
  (await call(actor, 'GET', `/guilds/${guild.id}`)).json().data.guild as {
    rules: string | null
    myPending: boolean
  }

const say = (actor: TestActor, content: string) =>
  call(actor, 'POST', `/channels/${textId}/messages`, { content })

beforeEach(async () => {
  await resetState(db, redis)
  events.clear()
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
  member = await signUp(app, { username: 'member', email: 'member@example.com' })
  newcomer = await signUp(app, { username: 'newcomer', email: 'newcomer@example.com' })
  guild = await createGuild(app, owner)
  await addMember(db, guild.id, member.id)
  textId = guild.channels.find((c) => c.type === 'text')?.id as string
})

afterAll(async () => {
  await close()
})

describe('server rules', () => {
  it('are set by managers and announced', async () => {
    const response = await setRules('  Будьте вежливы  ')

    expect(response.statusCode).toBe(200)
    expect(response.json().data.guild.rules).toBe('Будьте вежливы')
    expect(events.published.at(-1)).toMatchObject({
      type: 'GUILD_UPDATE',
      data: { id: guild.id, rules: 'Будьте вежливы' },
    })
    expect((await call(member, 'PATCH', `/guilds/${guild.id}`, { rules: 'x' })).statusCode).toBe(
      403,
    )
  })

  it('hold newcomers to reading until they accept them', async () => {
    await setRules('Будьте вежливы')
    await join(newcomer)

    expect(await detail(newcomer)).toMatchObject({ rules: 'Будьте вежливы', myPending: true })
    const refused = await say(newcomer, 'Привет')
    expect(refused.statusCode).toBe(403)
    expect(refused.json().code).toBe('RULES_NOT_ACCEPTED')

    const accepted = await call(newcomer, 'POST', `/guilds/${guild.id}/rules/accept`)
    expect(accepted.statusCode).toBe(200)
    expect(accepted.json().data.guild.myPending).toBe(false)
    expect(events.published).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'GUILD_MEMBER_UPDATE',
          data: expect.objectContaining({ userId: newcomer.id, pending: false }),
        }),
      ]),
    )
    expect((await say(newcomer, 'Привет')).statusCode).toBe(201)
  })

  it('leave members who joined before them alone', async () => {
    await setRules('Будьте вежливы')

    expect((await detail(member)).myPending).toBe(false)
    expect((await say(member, 'Я тут давно')).statusCode).toBe(201)
  })

  it('stop holding anyone back once removed', async () => {
    await setRules('Будьте вежливы')
    await join(newcomer)

    await setRules(null)

    expect((await detail(newcomer)).myPending).toBe(false)
    expect((await say(newcomer, 'Можно')).statusCode).toBe(201)
  })

  it('cannot be accepted outside the server', async () => {
    await setRules('Будьте вежливы')
    expect((await call(newcomer, 'POST', `/guilds/${guild.id}/rules/accept`)).statusCode).toBe(404)
  })
})
