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

const send = async (actor: TestActor, channelId: string, content: string) =>
  api(actor, 'POST', `/channels/${channelId}/messages`, { content })

const startThread = (actor: TestActor, payload: object, parentId = textId) =>
  api(actor, 'POST', `/channels/${parentId}/threads`, payload)

const channelsOf = async (actor: TestActor) =>
  (await api(actor, 'GET', `/guilds/${guild.id}`)).json().data.guild.channels as {
    id: string
    type: string
    messageCount: number
  }[]

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
  await close()
})

describe('starting a thread', () => {
  it('from a message, once, by anyone who may write in the channel', async () => {
    const messageId = (await send(owner, textId, 'Что думаете о релизе?')).json().data.message.id

    const created = await startThread(member, { name: '  Релиз 0.3 ', messageId })
    expect(created.statusCode).toBe(201)
    const thread = created.json().data.channel
    expect(thread).toMatchObject({
      type: 'thread',
      name: 'Релиз 0.3',
      parentId: textId,
      threadStarterId: messageId,
      ownerId: member.id,
      messageCount: 0,
    })
    expect(events.published).toContainEqual(
      expect.objectContaining({
        type: 'CHANNEL_CREATE',
        data: expect.objectContaining({ id: thread.id }),
      }),
    )
    expect((await channelsOf(member)).map((c) => c.id)).toContain(thread.id)

    const again = await startThread(owner, { name: 'Ещё раз', messageId })
    expect(again.statusCode).toBe(409)
    expect(again.json().code).toBe('THREAD_EXISTS')
  })

  it('without a message, but only in text channels', async () => {
    expect((await startThread(member, { name: 'Свободная тема' })).statusCode).toBe(201)

    const voiceId = guild.channels.find((c) => c.type === 'voice')?.id as string
    const inVoice = await startThread(member, { name: 'Нет' }, voiceId)
    expect(inVoice.statusCode).toBe(400)
    expect(inVoice.json().code).toBe('INVALID_CHANNEL')

    const thread = (await startThread(member, { name: 'Тред' })).json().data.channel
    const nested = await startThread(member, { name: 'Вложенный' }, thread.id)
    expect(nested.json().code).toBe('INVALID_CHANNEL')

    const otherMessage = (await send(owner, thread.id, 'в треде')).json().data.message.id
    const wrongParent = await startThread(member, { name: 'Чужое', messageId: otherMessage })
    expect(wrongParent.statusCode).toBe(404)
  })
})

describe('talking in a thread', () => {
  it('counts its messages and works like any channel', async () => {
    const thread = (await startThread(member, { name: 'Тред' })).json().data.channel
    expect((await send(owner, thread.id, 'раз')).statusCode).toBe(201)
    expect((await send(member, thread.id, 'два')).statusCode).toBe(201)

    const listed = await api(member, 'GET', `/channels/${thread.id}/messages`)
    expect(listed.json().data.messages.map((m: { content: string }) => m.content)).toEqual([
      'раз',
      'два',
    ])
    const counted = (await channelsOf(owner)).find((c) => c.id === thread.id)
    expect(counted?.messageCount).toBe(2)

    const message = listed.json().data.messages[0]
    await api(owner, 'DELETE', `/channels/${thread.id}/messages/${message.id}`)
    expect((await channelsOf(owner)).find((c) => c.id === thread.id)?.messageCount).toBe(1)
  })
})

describe('thread permissions', () => {
  it('follow the parent channel', async () => {
    const thread = (await startThread(owner, { name: 'Тред' })).json().data.channel
    await send(owner, thread.id, 'секрет')

    await api(owner, 'PUT', `/channels/${textId}/permissions/${member.id}`, {
      targetType: 'member',
      allow: '0',
      deny: Permission.ViewChannel.toString(),
    })

    expect((await api(member, 'GET', `/channels/${thread.id}/messages`)).statusCode).toBe(404)
    expect((await channelsOf(member)).map((c) => c.id)).not.toContain(thread.id)

    await api(owner, 'DELETE', `/channels/${textId}/permissions/${member.id}`)
    expect((await api(member, 'GET', `/channels/${thread.id}/messages`)).statusCode).toBe(200)
  })

  it("can't be set on the thread itself", async () => {
    const thread = (await startThread(owner, { name: 'Тред' })).json().data.channel
    const response = await api(owner, 'PUT', `/channels/${thread.id}/permissions/${member.id}`, {
      targetType: 'member',
      allow: '0',
      deny: Permission.ViewChannel.toString(),
    })
    expect(response.statusCode).toBe(400)
    expect(response.json().code).toBe('INVALID_CHANNEL')
  })

  it('need SEND_MESSAGES in the channel to start one', async () => {
    await api(owner, 'PUT', `/channels/${textId}/permissions/${member.id}`, {
      targetType: 'member',
      allow: '0',
      deny: Permission.SendMessages.toString(),
    })
    expect((await startThread(member, { name: 'Нельзя' })).statusCode).toBe(403)
  })
})

describe('deleting', () => {
  it("a channel takes its threads with it; a thread's author can delete it", async () => {
    const thread = (await startThread(member, { name: 'Тред' })).json().data.channel
    expect((await api(member, 'DELETE', `/channels/${thread.id}`)).statusCode).toBe(204)

    const second = (await startThread(member, { name: 'Ещё' })).json().data.channel
    await api(owner, 'DELETE', `/channels/${textId}`)
    expect((await channelsOf(owner)).map((c) => c.id)).not.toContain(second.id)
    expect(events.published).toContainEqual(
      expect.objectContaining({
        type: 'CHANNEL_DELETE',
        data: expect.objectContaining({ id: second.id }),
      }),
    )
  })
})

describe('threads after review', () => {
  it('inherit slowmode and the NSFW flag from their channel', async () => {
    const thread = (await startThread(member, { name: 'Тред' })).json().data.channel
    await api(owner, 'PATCH', `/channels/${textId}`, { rateLimitPerUser: 60, nsfw: true })

    const synced = (await channelsOf(member)).find((c) => c.id === thread.id) as unknown as {
      rateLimitPerUser: number
      nsfw: boolean
    }
    expect(synced).toMatchObject({ rateLimitPerUser: 60, nsfw: true })
    expect((await send(member, thread.id, 'раз')).statusCode).toBe(201)
    expect((await send(member, thread.id, 'два')).json().code).toBe('SLOWMODE')

    const later = (await startThread(owner, { name: 'Позже' })).json().data.channel
    expect(later).toMatchObject({ rateLimitPerUser: 60, nsfw: true })
  })

  it("don't let their author delete other people's messages with them", async () => {
    const thread = (await startThread(member, { name: 'Тред' })).json().data.channel
    await send(owner, thread.id, 'ответ владельца')

    const refused = await api(member, 'DELETE', `/channels/${thread.id}`)
    expect(refused.statusCode).toBe(403)
  })

  it('need to read the history to start one from a message', async () => {
    const messageId = (await send(owner, textId, 'старое')).json().data.message.id
    await api(owner, 'PUT', `/channels/${textId}/permissions/${member.id}`, {
      targetType: 'member',
      allow: '0',
      deny: Permission.ReadMessageHistory.toString(),
    })
    expect((await startThread(member, { name: 'Тред', messageId })).statusCode).toBe(403)
  })

  it('lose their starter when that message is deleted', async () => {
    const messageId = (await send(owner, textId, 'начало')).json().data.message.id
    const thread = (await startThread(member, { name: 'Тред', messageId })).json().data.channel
    await api(owner, 'DELETE', `/channels/${textId}/messages/${messageId}`)

    const after = (await channelsOf(owner)).find((c) => c.id === thread.id) as unknown as {
      threadStarterId: string | null
    }
    expect(after.threadStarterId).toBeNull()
  })

  it("aren't announced to everyone on every message; counts follow real deletions", async () => {
    const thread = (await startThread(member, { name: 'Тред' })).json().data.channel
    events.clear()
    const message = (await send(member, thread.id, 'раз')).json().data.message
    expect(events.published.filter((e) => e.type === 'CHANNEL_UPDATE')).toEqual([])

    await Promise.all([
      api(member, 'DELETE', `/channels/${thread.id}/messages/${message.id}`),
      api(member, 'DELETE', `/channels/${thread.id}/messages/${message.id}`),
    ])
    await send(member, thread.id, 'два')
    expect((await channelsOf(owner)).find((c) => c.id === thread.id)?.messageCount).toBe(1)
  })

  it("can't be the target of an invite", async () => {
    const thread = (await startThread(member, { name: 'Тред' })).json().data.channel
    const invite = await api(owner, 'POST', `/channels/${thread.id}/invites`, {})
    expect(invite.statusCode).toBe(400)
  })
})
