import { Permission } from '@chinchi/shared'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'
import { SPAM_MESSAGES } from './automod.service'

import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, events, close } = createTestApp({ env: { RATE_LIMIT: 'off' } })

let owner: TestActor
let mod: TestActor
let member: TestActor
let guild: Awaited<ReturnType<typeof createGuild>>
let textId: string

const api = (
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
  api(actor, 'POST', `/channels/${textId}/messages`, { content })

const g = () => `/guilds/${guild.id}`

beforeEach(async () => {
  await resetState(db, redis)
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
  mod = await signUp(app, { username: 'mod', email: 'mod@example.com' })
  member = await signUp(app, { username: 'member', email: 'member@example.com' })
  guild = await createGuild(app, owner)
  textId = guild.channels.find((c) => c.type === 'text')?.id as string
  await addMember(db, guild.id, mod.id)
  await addMember(db, guild.id, member.id)
  const roleId = (
    await api(owner, 'POST', `${g()}/roles`, {
      name: 'mods',
      permissions: Permission.ManageMessages.toString(),
    })
  ).json().data.role.id
  await api(owner, 'PUT', `${g()}/members/${mod.id}/roles/${roleId}`)
  events.clear()
})

afterAll(async () => {
  await close()
})

describe('automod settings', () => {
  it('are off by default and changed by those who manage the server', async () => {
    const initial = await api(owner, 'GET', `${g()}/automod`)
    expect(initial.json().data.automod).toEqual({
      blockedWords: [],
      antiSpam: false,
      maxMentions: null,
    })

    const updated = await api(owner, 'PATCH', `${g()}/automod`, {
      blockedWords: ['Казино'],
      maxMentions: 5,
    })
    expect(updated.json().data.automod).toEqual({
      blockedWords: ['казино'],
      antiSpam: false,
      maxMentions: 5,
    })
    expect((await api(member, 'PATCH', `${g()}/automod`, { antiSpam: true })).statusCode).toBe(403)
  })
})

describe('blocked words', () => {
  it('refuse messages and edits that contain them, and log it; moderators pass', async () => {
    await api(owner, 'PATCH', `${g()}/automod`, { blockedWords: ['казино'] })

    const blocked = await send(member, 'лучшее Казино тут')
    expect(blocked.statusCode).toBe(400)
    expect(blocked.json().code).toBe('AUTOMOD_BLOCKED')

    const fine = (await send(member, 'обычное сообщение')).json().data.message
    const edited = await api(member, 'PATCH', `/channels/${textId}/messages/${fine.id}`, {
      content: 'а теперь казино',
    })
    expect(edited.json().code).toBe('AUTOMOD_BLOCKED')

    expect((await send(mod, 'про казино можно модераторам')).statusCode).toBe(201)

    // Retrying the word doesn't flood the journal: one entry per person per minute.
    await send(member, 'казино')
    await send(member, 'казино')
    const log = (await api(owner, 'GET', `${g()}/audit-log`)).json().data.entries
    const blocks = log.filter((e: { action: string }) => e.action === 'automod_block')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ actor: { id: member.id } })
  })
})

describe('mention limit', () => {
  it('refuses messages that mention too many', async () => {
    await api(owner, 'PATCH', `${g()}/automod`, { maxMentions: 2 })

    const many = await send(member, `<@${owner.id}> <@${mod.id}> @everyone`)
    expect(many.statusCode).toBe(400)
    expect(many.json().code).toBe('AUTOMOD_MENTIONS')
    expect((await send(member, `<@${owner.id}> <@${mod.id}>`)).statusCode).toBe(201)
  })
})

describe('anti-spam', () => {
  it('leaves slowmode channels to slowmode', async () => {
    await api(owner, 'PATCH', `${g()}/automod`, { antiSpam: true })
    await api(owner, 'PATCH', `/channels/${textId}`, { rateLimitPerUser: 5 })

    expect((await send(member, 'раз')).statusCode).toBe(201)
    for (let i = 0; i <= SPAM_MESSAGES; i += 1) {
      expect((await send(member, `рано ${i}`)).json().code).toBe('SLOWMODE')
    }
  })

  it('times out someone sending too fast', async () => {
    await api(owner, 'PATCH', `${g()}/automod`, { antiSpam: true })

    for (let i = 0; i < SPAM_MESSAGES; i += 1) {
      expect((await send(member, `сообщение ${i}`)).statusCode).toBe(201)
    }
    const flood = await send(member, 'ещё')
    expect(flood.statusCode).toBe(429)
    expect(flood.json().code).toBe('AUTOMOD_SPAM')
    expect(events.published).toContainEqual(
      expect.objectContaining({
        type: 'GUILD_MEMBER_UPDATE',
        data: expect.objectContaining({ userId: member.id, timeoutUntil: expect.any(String) }),
      }),
    )
    expect((await send(member, 'а теперь?')).statusCode).toBe(403)

    // Moderators are never counted.
    for (let i = 0; i <= SPAM_MESSAGES; i += 1) {
      expect((await send(mod, `объявление ${i}`)).statusCode).toBe(201)
    }
  })
})
