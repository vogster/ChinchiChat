import { Permission } from '@chinchi/shared'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, events, close } = createTestApp()

let owner: TestActor
let member: TestActor
let outsider: TestActor
let guild: Awaited<ReturnType<typeof createGuild>>
let textId: string
let voiceId: string

const call = (
  actor: TestActor,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: actor.headers,
    ...(payload ? { payload } : {}),
  })

const send = async (actor: TestActor, content: string, channelId = textId) => {
  const response = await call(actor, 'POST', `/channels/${channelId}/messages`, { content })
  return response.json().data.message as { id: string; content: string }
}

beforeEach(async () => {
  await resetState(db, redis)
  events.clear()
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
  member = await signUp(app, { username: 'member', email: 'member@example.com' })
  outsider = await signUp(app, { username: 'outsider', email: 'outsider@example.com' })
  guild = await createGuild(app, owner)
  await addMember(db, guild.id, member.id)
  textId = guild.channels.find((c) => c.type === 'text')?.id as string
  voiceId = guild.channels.find((c) => c.type === 'voice')?.id as string
})

afterAll(async () => {
  await close()
})

describe('POST /api/v1/channels/:id/messages', () => {
  it('posts a message and publishes MESSAGE_CREATE to the server', async () => {
    const response = await call(member, 'POST', `/channels/${textId}/messages`, {
      content: '  Привет!  ',
      nonce: 'n-1',
    })

    expect(response.statusCode).toBe(201)
    const message = response.json().data.message
    expect(message).toMatchObject({
      id: expect.stringMatching(/^\d+$/),
      channelId: textId,
      guildId: guild.id,
      author: { id: member.id, username: 'member', displayName: null },
      content: 'Привет!',
      editedAt: null,
      nonce: 'n-1',
    })
    expect(events.published).toContainEqual({
      topic: `guild:${guild.id}`,
      type: 'MESSAGE_CREATE',
      data: message,
    })
  })

  it('only accepts messages in text channels', async () => {
    const response = await call(member, 'POST', `/channels/${voiceId}/messages`, { content: 'hi' })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ code: 'INVALID_CHANNEL' })
  })

  it('hides the channel from outsiders', async () => {
    const response = await call(outsider, 'POST', `/channels/${textId}/messages`, { content: 'hi' })
    expect(response.statusCode).toBe(404)
  })

  it('rejects empty messages', async () => {
    const response = await call(member, 'POST', `/channels/${textId}/messages`, { content: '   ' })
    expect(response.json()).toMatchObject({ code: 'VALIDATION_FAILED' })
  })

  it('limits how fast a user can post', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 12; i += 1) {
      statuses.push(
        (await call(member, 'POST', `/channels/${textId}/messages`, { content: `m${i}` }))
          .statusCode,
      )
    }
    expect(statuses.filter((status) => status === 201)).toHaveLength(10)
    expect(statuses.at(-1)).toBe(429)

    // The limit is per user, not per IP: others on the same address can still talk.
    const other = await call(owner, 'POST', `/channels/${textId}/messages`, {
      content: 'still here',
    })
    expect(other.statusCode).toBe(201)
  })
})

describe('GET /api/v1/channels/:id/messages', () => {
  it('returns the latest messages oldest-first', async () => {
    for (const content of ['one', 'two', 'three']) await send(member, content)

    const response = await call(owner, 'GET', `/channels/${textId}/messages?limit=2`)

    expect(response.statusCode).toBe(200)
    expect(response.json().data.messages.map((m: { content: string }) => m.content)).toEqual([
      'two',
      'three',
    ])
  })

  it('pages backwards with before and forwards with after', async () => {
    const sent = []
    for (const content of ['a', 'b', 'c', 'd', 'e']) sent.push(await send(member, content))

    const older = await call(
      owner,
      'GET',
      `/channels/${textId}/messages?before=${sent[3]?.id}&limit=2`,
    )
    const newer = await call(
      owner,
      'GET',
      `/channels/${textId}/messages?after=${sent[1]?.id}&limit=2`,
    )

    expect(older.json().data.messages.map((m: { content: string }) => m.content)).toEqual([
      'b',
      'c',
    ])
    expect(newer.json().data.messages.map((m: { content: string }) => m.content)).toEqual([
      'c',
      'd',
    ])
  })

  it('hides history from outsiders', async () => {
    await send(member, 'secret')
    expect((await call(outsider, 'GET', `/channels/${textId}/messages`)).statusCode).toBe(404)
  })
})

describe('PATCH /api/v1/channels/:id/messages/:messageId', () => {
  it('lets the author edit and publishes MESSAGE_UPDATE', async () => {
    const message = await send(member, 'teh typo')

    const response = await call(member, 'PATCH', `/channels/${textId}/messages/${message.id}`, {
      content: 'the typo',
    })

    expect(response.statusCode).toBe(200)
    const updated = response.json().data.message
    expect(updated).toMatchObject({ content: 'the typo', editedAt: expect.any(String) })
    expect(events.published.at(-1)).toEqual({
      topic: `guild:${guild.id}`,
      type: 'MESSAGE_UPDATE',
      data: updated,
    })
  })

  it('does not let anyone else edit, not even the owner', async () => {
    const message = await send(member, 'mine')

    const response = await call(owner, 'PATCH', `/channels/${textId}/messages/${message.id}`, {
      content: 'yours',
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toMatchObject({ code: 'NOT_MESSAGE_AUTHOR' })
  })

  it('stops once the author may no longer write in the channel', async () => {
    const message = await send(member, 'before the mute')
    await app.inject({
      method: 'PUT',
      url: `/api/v1/channels/${textId}/permissions/${member.id}`,
      headers: owner.headers,
      payload: { targetType: 'member', allow: '0', deny: Permission.SendMessages.toString() },
    })

    const response = await call(member, 'PATCH', `/channels/${textId}/messages/${message.id}`, {
      content: 'rewritten after the mute',
    })
    expect(response.statusCode).toBe(403)
  })

  it('answers 404 for messages from another channel', async () => {
    const other = await call(owner, 'POST', `/guilds/${guild.id}/channels`, {
      type: 'text',
      name: 'other',
    })
    const message = await send(member, 'here')

    const response = await call(
      member,
      'PATCH',
      `/channels/${other.json().data.channel.id}/messages/${message.id}`,
      {
        content: 'there',
      },
    )
    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ code: 'UNKNOWN_MESSAGE' })
  })
})

describe('DELETE /api/v1/channels/:id/messages/:messageId', () => {
  it('lets the author delete and publishes MESSAGE_DELETE', async () => {
    const message = await send(member, 'oops')

    expect(
      (await call(member, 'DELETE', `/channels/${textId}/messages/${message.id}`)).statusCode,
    ).toBe(204)
    expect(events.published.at(-1)).toEqual({
      topic: `guild:${guild.id}`,
      type: 'MESSAGE_DELETE',
      data: { id: message.id, channelId: textId, guildId: guild.id },
    })
    const history = await call(owner, 'GET', `/channels/${textId}/messages`)
    expect(history.json().data.messages).toEqual([])
  })

  it('lets the server owner moderate', async () => {
    const message = await send(member, 'spam')
    expect(
      (await call(owner, 'DELETE', `/channels/${textId}/messages/${message.id}`)).statusCode,
    ).toBe(204)
  })

  it('does not let other members delete', async () => {
    const message = await send(owner, 'important')
    expect(
      (await call(member, 'DELETE', `/channels/${textId}/messages/${message.id}`)).statusCode,
    ).toBe(403)
  })
})
