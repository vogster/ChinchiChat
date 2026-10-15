import { Permission } from '@chinchi/shared'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { guildMembers } from '../../db/schema'
import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, events, close } = createTestApp({ env: { RATE_LIMIT: 'off' } })

let owner: TestActor
let mod: TestActor
let member: TestActor
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

const g = () => `/guilds/${guild.id}`

const memberIds = async () =>
  (
    (await api(owner, 'GET', `${g()}/members`)).json().data.members as { user: { id: string } }[]
  ).map((m) => m.user.id)

const send = (actor: TestActor, content: string) =>
  api(actor, 'POST', `/channels/${textId}/messages`, { content })

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
      permissions: (
        Permission.KickMembers |
        Permission.BanMembers |
        Permission.ModerateMembers |
        Permission.ViewAuditLog
      ).toString(),
    })
  ).json().data.role.id
  await api(owner, 'PUT', `${g()}/members/${mod.id}/roles/${roleId}`)
  events.clear()
})

afterAll(async () => {
  await close()
})

describe('kick', () => {
  it('removes the member, tells them and the server, and they may come back', async () => {
    const kicked = await api(mod, 'POST', `${g()}/members/${member.id}/kick`, { reason: 'флуд' })

    expect(kicked.statusCode).toBe(204)
    expect(await memberIds()).not.toContain(member.id)
    expect(events.published).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ topic: `user:${member.id}`, type: 'GUILD_DELETE' }),
        expect.objectContaining({ topic: `guild:${guild.id}`, type: 'GUILD_MEMBER_REMOVE' }),
      ]),
    )
    const invite = (await api(owner, 'POST', `/channels/${textId}/invites`, {})).json().data.invite
    expect((await api(member, 'POST', `/invites/${invite.code}`)).statusCode).toBe(200)
  })

  it('needs KICK_MEMBERS and a higher role; nobody kicks the owner', async () => {
    expect((await api(member, 'POST', `${g()}/members/${mod.id}/kick`, {})).statusCode).toBe(403)
    const onOwner = await api(mod, 'POST', `${g()}/members/${owner.id}/kick`, {})
    expect(onOwner.json().code).toBe('ROLE_HIERARCHY')
  })
})

describe('ban', () => {
  it('removes the member, keeps them out and can clean up their recent messages', async () => {
    await send(member, 'реклама')
    await send(member, 'ещё реклама')
    await send(owner, 'это останется')

    const banned = await api(mod, 'PUT', `${g()}/bans/${member.id}`, {
      reason: 'спам',
      deleteMessageSeconds: 3600,
    })

    expect(banned.statusCode).toBe(204)
    expect(await memberIds()).not.toContain(member.id)
    const messages = (await api(owner, 'GET', `/channels/${textId}/messages`)).json().data.messages
    expect(messages.map((m: { content: string }) => m.content)).toEqual(['это останется'])
    expect(events.published.filter((e) => e.type === 'MESSAGE_DELETE')).toHaveLength(2)

    const invite = (await api(owner, 'POST', `/channels/${textId}/invites`, {})).json().data.invite
    const rejoin = await api(member, 'POST', `/invites/${invite.code}`)
    expect(rejoin.statusCode).toBe(403)
    expect(rejoin.json().code).toBe('BANNED')

    const bans = (await api(mod, 'GET', `${g()}/bans`)).json().data.bans
    expect(bans).toEqual([
      {
        user: expect.objectContaining({ id: member.id }),
        reason: 'спам',
        createdAt: expect.any(String),
      },
    ])

    expect((await api(mod, 'DELETE', `${g()}/bans/${member.id}`)).statusCode).toBe(204)
    expect((await api(member, 'POST', `/invites/${invite.code}`)).statusCode).toBe(200)
  })

  it('can ban someone who already left, and needs BAN_MEMBERS', async () => {
    await api(member, 'DELETE', `${g()}/members/@me`)
    expect((await api(mod, 'PUT', `${g()}/bans/${member.id}`, {})).statusCode).toBe(204)
    expect((await api(member, 'GET', `${g()}/bans`)).statusCode).toBe(404)
  })
})

describe('timeout', () => {
  it('leaves the member reading only until it ends or is lifted', async () => {
    const until = new Date(Date.now() + 10 * 60_000).toISOString()
    const timedOut = await api(mod, 'PATCH', `${g()}/members/${member.id}/timeout`, { until })

    expect(timedOut.statusCode).toBe(204)
    expect(events.published).toContainEqual(
      expect.objectContaining({
        type: 'GUILD_MEMBER_UPDATE',
        data: expect.objectContaining({ userId: member.id, timeoutUntil: until }),
      }),
    )
    expect((await send(member, 'можно?')).statusCode).toBe(403)
    expect((await api(member, 'GET', `/channels/${textId}/messages`)).statusCode).toBe(200)
    const detail = (await api(member, 'GET', g())).json().data.guild
    expect(detail.myTimeoutUntil).toBe(until)

    await api(mod, 'PATCH', `${g()}/members/${member.id}/timeout`, { until: null })
    expect((await send(member, 'а теперь?')).statusCode).toBe(201)
  })

  it('is still there after leaving and coming back', async () => {
    const until = new Date(Date.now() + 10 * 60_000).toISOString()
    await api(mod, 'PATCH', `${g()}/members/${member.id}/timeout`, { until })
    const invite = (await api(mod, 'POST', `/channels/${textId}/invites`, {})).json().data.invite

    await api(member, 'DELETE', `${g()}/members/@me`)
    expect((await api(member, 'POST', `/invites/${invite.code}`)).statusCode).toBe(200)

    expect((await send(member, 'я снова тут')).statusCode).toBe(403)
    expect((await api(member, 'GET', g())).json().data.guild.myTimeoutUntil).toBe(until)
  })

  it('ends by itself once the time is up', async () => {
    await db
      .update(guildMembers)
      .set({ timeoutUntil: new Date(Date.now() - 1000) })
      .where(and(eq(guildMembers.guildId, guild.id), eq(guildMembers.userId, member.id)))

    expect((await send(member, 'уже можно')).statusCode).toBe(201)
  })

  it('must end in the future', async () => {
    const past = new Date(Date.now() - 1000).toISOString()
    const response = await api(mod, 'PATCH', `${g()}/members/${member.id}/timeout`, { until: past })

    expect(response.statusCode).toBe(400)
  })

  it('keeps old messages as they were', async () => {
    const message = (await send(member, 'было')).json().data.message
    await api(mod, 'PATCH', `${g()}/members/${member.id}/timeout`, {
      until: new Date(Date.now() + 60_000).toISOString(),
    })

    const edited = await api(member, 'PATCH', `/channels/${textId}/messages/${message.id}`, {
      content: 'стало',
    })
    expect(edited.statusCode).toBe(403)
  })

  it('does not apply to administrators, so they cannot be given one', async () => {
    const adminRole = (
      await api(owner, 'POST', `${g()}/roles`, {
        name: 'admins',
        permissions: Permission.Administrator.toString(),
      })
    ).json().data.role.id
    await api(owner, 'PUT', `${g()}/members/${member.id}/roles/${adminRole}`)

    const response = await api(owner, 'PATCH', `${g()}/members/${member.id}/timeout`, {
      until: new Date(Date.now() + 60_000).toISOString(),
    })
    expect(response.statusCode).toBe(403)
    expect(response.json().code).toBe('TIMEOUT_IMMUNE')
  })

  it('needs MODERATE_MEMBERS and a higher role', async () => {
    const until = new Date(Date.now() + 60_000).toISOString()
    expect(
      (await api(member, 'PATCH', `${g()}/members/${mod.id}/timeout`, { until })).statusCode,
    ).toBe(403)
  })
})

describe('audit log', () => {
  it('records moderation with who, whom and why, newest first, for VIEW_AUDIT_LOG', async () => {
    await api(mod, 'PATCH', `${g()}/members/${member.id}/timeout`, {
      until: new Date(Date.now() + 60_000).toISOString(),
      reason: 'остынь',
    })
    await api(mod, 'POST', `${g()}/members/${member.id}/kick`, { reason: 'флуд' })

    const log = await api(mod, 'GET', `${g()}/audit-log`)

    expect(log.statusCode).toBe(200)
    const entries = log.json().data.entries
    expect(entries.slice(0, 2)).toMatchObject([
      {
        action: 'member_kick',
        actor: { id: mod.id },
        targetUser: { id: member.id },
        reason: 'флуд',
      },
      { action: 'member_timeout', reason: 'остынь', data: { until: expect.any(String) } },
    ])
    expect((await api(member, 'GET', `${g()}/audit-log`)).statusCode).toBe(404)
  })

  it('records a moderator deleting someone else’s message, channel and role changes', async () => {
    const message = (await send(member, 'удалите меня')).json().data.message
    await api(owner, 'DELETE', `/channels/${textId}/messages/${message.id}`)
    await api(owner, 'PATCH', `/channels/${textId}`, { name: 'болталка' })
    await api(owner, 'POST', `${g()}/roles`, { name: 'гости' })

    const actions = (await api(owner, 'GET', `${g()}/audit-log`))
      .json()
      .data.entries.map((e: { action: string }) => e.action)

    expect(actions.slice(0, 3)).toEqual(['role_create', 'channel_update', 'message_delete'])
  })

  it('keeps hidden channels hidden from those who can read the log', async () => {
    const secret = (
      await api(owner, 'POST', `${g()}/channels`, { name: 'секретный', type: 'text' })
    ).json().data.channel
    await api(owner, 'PUT', `/channels/${secret.id}/permissions/${mod.id}`, {
      targetType: 'member',
      allow: '0',
      deny: Permission.ViewChannel.toString(),
    })

    const [entry] = (await api(mod, 'GET', `${g()}/audit-log`))
      .json()
      .data.entries.filter((e: { action: string }) => e.action === 'channel_create')
    expect(entry).toMatchObject({ targetId: null, data: {} })

    const [own] = (await api(owner, 'GET', `${g()}/audit-log`))
      .json()
      .data.entries.filter((e: { action: string }) => e.action === 'channel_create')
    expect(own).toMatchObject({ targetId: secret.id, data: { name: 'секретный' } })
  })
})
