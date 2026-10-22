import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, close } = createTestApp({ env: { RATE_LIMIT: 'off' } })

let owner: TestActor
let reader: TestActor
let follower: TestActor
let source: Awaited<ReturnType<typeof createGuild>>
let target: Awaited<ReturnType<typeof createGuild>>
let newsId: string
let targetTextId: string

const api = (
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

const textOf = (guild: Awaited<ReturnType<typeof createGuild>>) =>
  guild.channels.find((c) => c.type === 'text')?.id as string

const post = async (content: string) =>
  (await api(owner, 'POST', `/channels/${newsId}/messages`, { content })).json().data.message as {
    id: string
  }

beforeEach(async () => {
  await resetState(db, redis)
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
  reader = await signUp(app, { username: 'reader', email: 'reader@example.com' })
  follower = await signUp(app, { username: 'follower', email: 'follower@example.com' })
  source = await createGuild(app, owner, 'Новости')
  target = await createGuild(app, follower, 'Читатели')
  newsId = textOf(source)
  targetTextId = textOf(target)
  await addMember(db, source.id, reader.id)
  await addMember(db, source.id, follower.id)
  await addMember(db, target.id, reader.id)
})

afterAll(async () => {
  await close()
})

describe('announcement channels', () => {
  it('are text channels a manager marks as such', async () => {
    const marked = await api(owner, 'PATCH', `/channels/${newsId}`, { announcement: true })
    expect(marked.json().data.channel).toMatchObject({ announcement: true })

    const voiceId = source.channels.find((c) => c.type === 'voice')?.id as string
    const voice = await api(owner, 'PATCH', `/channels/${voiceId}`, { announcement: true })
    expect(voice.json().code).toBe('INVALID_CHANNEL_OPTION')
  })

  it('reach the channels that follow them when a message is published', async () => {
    await api(owner, 'PATCH', `/channels/${newsId}`, { announcement: true })
    const followed = await api(follower, 'POST', `/channels/${newsId}/followers`, {
      channelId: targetTextId,
    })
    expect(followed.statusCode).toBe(201)
    expect(followed.json().data.webhook).toMatchObject({
      channelId: targetTextId,
      sourceChannelId: newsId,
    })

    const twice = await api(follower, 'POST', `/channels/${newsId}/followers`, {
      channelId: targetTextId,
    })
    expect(twice.json().code).toBe('ALREADY_FOLLOWING')

    const message = await post('Вышла версия 1.0')
    const published = await api(owner, 'POST', `/channels/${newsId}/messages/${message.id}/publish`)
    expect(published.statusCode).toBe(200)
    expect(published.json().data.message).toMatchObject({ published: true })

    const copies = (await api(follower, 'GET', `/channels/${targetTextId}/messages`)).json().data
      .messages
    expect(copies[0]).toMatchObject({
      content: 'Вышла версия 1.0',
      author: null,
      webhook: { name: 'Новости #general' },
    })

    const again = await api(owner, 'POST', `/channels/${newsId}/messages/${message.id}/publish`)
    expect(again.statusCode).toBe(409)
    expect(again.json().code).toBe('ALREADY_PUBLISHED')
  })

  it('are published by the author or a moderator only', async () => {
    await api(owner, 'PATCH', `/channels/${newsId}`, { announcement: true })
    const message = await post('Только для своих')

    const stranger = await api(reader, 'POST', `/channels/${newsId}/messages/${message.id}/publish`)
    expect(stranger.statusCode).toBe(403)

    await api(owner, 'PATCH', `/channels/${newsId}`, { announcement: false })
    const plain = await api(owner, 'POST', `/channels/${newsId}/messages/${message.id}/publish`)
    expect(plain.json().code).toBe('NOT_ANNOUNCEMENT')
  })

  it('are followed into channels the follower manages', async () => {
    const notYet = await api(follower, 'POST', `/channels/${newsId}/followers`, {
      channelId: targetTextId,
    })
    expect(notYet.json().code).toBe('NOT_ANNOUNCEMENT')

    await api(owner, 'PATCH', `/channels/${newsId}`, { announcement: true })
    const noRights = await api(reader, 'POST', `/channels/${newsId}/followers`, {
      channelId: targetTextId,
    })
    expect(noRights.statusCode).toBe(403)

    const outsider = await signUp(app, { username: 'outsider', email: 'out@example.com' })
    const unseen = await api(outsider, 'POST', `/channels/${newsId}/followers`, {
      channelId: targetTextId,
    })
    expect(unseen.statusCode).toBe(404)
  })

  it('stop reaching followers once the source channel is gone', async () => {
    await api(owner, 'PATCH', `/channels/${newsId}`, { announcement: true })
    await api(follower, 'POST', `/channels/${newsId}/followers`, { channelId: targetTextId })
    const extra = await api(owner, 'POST', `/guilds/${source.id}/channels`, {
      name: 'extra',
      type: 'text',
    })
    expect(extra.statusCode).toBe(201)
    await api(owner, 'DELETE', `/channels/${newsId}`)

    const hooks = (await api(follower, 'GET', `/channels/${targetTextId}/webhooks`)).json().data
      .webhooks
    expect(hooks).toEqual([])
  })

  it('stop reaching followers who lost access to the source', async () => {
    await api(owner, 'PATCH', `/channels/${newsId}`, { announcement: true })
    await api(follower, 'POST', `/channels/${newsId}/followers`, { channelId: targetTextId })
    await api(owner, 'POST', `/guilds/${source.id}/members/${follower.id}/kick`, {})

    const message = await post('Только своим')
    await api(owner, 'POST', `/channels/${newsId}/messages/${message.id}/publish`)

    const copies = (await api(follower, 'GET', `/channels/${targetTextId}/messages`)).json().data
      .messages
    expect(copies.map((m: { content: string }) => m.content)).not.toContain('Только своим')
    const hooks = (await api(follower, 'GET', `/channels/${targetTextId}/webhooks`)).json().data
      .webhooks
    expect(hooks).toEqual([])
  })

  it("don't carry age-restricted posts into ordinary channels", async () => {
    await api(owner, 'PATCH', `/channels/${newsId}`, { announcement: true, nsfw: true })
    const followed = await api(follower, 'POST', `/channels/${newsId}/followers`, {
      channelId: targetTextId,
    })
    expect(followed.json().code).toBe('NSFW_MISMATCH')
  })
})

describe('followers of an announcement channel', () => {
  const follow = async () =>
    (
      await api(follower, 'POST', `/channels/${newsId}/followers`, { channelId: targetTextId })
    ).json().data.webhook as { id: string }

  beforeEach(async () => {
    await api(owner, 'PATCH', `/channels/${newsId}`, { announcement: true })
  })

  it('are listed in full to the source managers, a server they can not see left unnamed', async () => {
    const hook = await follow()

    const listed = await api(owner, 'GET', `/channels/${newsId}/followers`)
    expect(listed.statusCode).toBe(200)
    expect(listed.json().data.followers).toEqual([
      {
        webhookId: hook.id,
        guildId: null,
        guildName: null,
        channelId: null,
        channelName: null,
        mine: false,
        createdAt: expect.any(String),
      },
    ])
  })

  it('are listed to others only where they manage the following channel', async () => {
    const hook = await follow()

    const mine = (await api(follower, 'GET', `/channels/${newsId}/followers`)).json().data
    expect(mine.followers).toEqual([
      expect.objectContaining({
        webhookId: hook.id,
        guildId: target.id,
        guildName: 'Читатели',
        channelId: targetTextId,
        channelName: 'general',
        mine: true,
      }),
    ])
    // A member who manages neither side sees none; someone outside the source, nothing at all.
    expect(
      (await api(reader, 'GET', `/channels/${newsId}/followers`)).json().data.followers,
    ).toEqual([])
    const outsider = await signUp(app, { username: 'outsider', email: 'out@example.com' })
    expect((await api(outsider, 'GET', `/channels/${newsId}/followers`)).statusCode).toBe(404)
  })

  it('are removed from the following side, then can be followed again', async () => {
    const hook = await follow()

    const removed = await api(follower, 'DELETE', `/channels/${newsId}/followers/${hook.id}`)
    expect(removed.statusCode).toBe(204)
    expect(
      (await api(follower, 'GET', `/channels/${newsId}/followers`)).json().data.followers,
    ).toEqual([])
    const hooks = (await api(follower, 'GET', `/channels/${targetTextId}/webhooks`)).json().data
    expect(hooks.webhooks).toEqual([])
    expect(
      (await api(follower, 'POST', `/channels/${newsId}/followers`, { channelId: targetTextId }))
        .statusCode,
    ).toBe(201)
  })

  it('are removed from the source side, and by nobody else', async () => {
    const hook = await follow()
    const outsider = await signUp(app, { username: 'outsider', email: 'out@example.com' })

    expect(
      (await api(reader, 'DELETE', `/channels/${newsId}/followers/${hook.id}`)).statusCode,
    ).toBe(404)
    expect(
      (await api(outsider, 'DELETE', `/channels/${newsId}/followers/${hook.id}`)).statusCode,
    ).toBe(404)
    // A webhook that is not a follower of this channel is not one to remove here.
    const plain = (
      await api(follower, 'POST', `/channels/${targetTextId}/webhooks`, { name: 'CI' })
    ).json().data.webhook as { id: string }
    expect(
      (await api(owner, 'DELETE', `/channels/${newsId}/followers/${plain.id}`)).statusCode,
    ).toBe(404)

    expect(
      (await api(owner, 'DELETE', `/channels/${newsId}/followers/${hook.id}`)).statusCode,
    ).toBe(204)
    expect(
      (await api(owner, 'GET', `/channels/${newsId}/followers`)).json().data.followers,
    ).toEqual([])
  })

  it('show in the following channel’s webhooks with where they come from', async () => {
    await follow()

    const hooks = (await api(follower, 'GET', `/channels/${targetTextId}/webhooks`)).json().data
    expect(hooks.webhooks).toEqual([
      expect.objectContaining({ sourceChannelId: newsId, sourceGuildId: source.id }),
    ])
  })
})
