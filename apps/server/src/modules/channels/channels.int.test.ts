import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, close } = createTestApp()

let owner: TestActor
let member: TestActor
let outsider: TestActor
let guild: Awaited<ReturnType<typeof createGuild>>

const call = (
  actor: TestActor,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: unknown,
) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: actor.headers,
    ...(payload !== undefined ? { payload: payload as object } : {}),
  })

const channelNamed = (name: string) => {
  const found = guild.channels.find((channel) => channel.name === name)
  if (!found) throw new Error(`No channel ${name}`)
  return found
}

const listChannels = async (actor: TestActor = owner) =>
  (await call(actor, 'GET', `/guilds/${guild.id}`)).json().data.guild.channels as {
    id: string
    name: string
    type: string
    parentId: string | null
    position: number
    topic: string | null
  }[]

beforeEach(async () => {
  await resetState(db, redis)
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
  member = await signUp(app, { username: 'member', email: 'member@example.com' })
  outsider = await signUp(app, { username: 'outsider', email: 'outsider@example.com' })
  guild = await createGuild(app, owner)
  await addMember(db, guild.id, member.id)
})

afterAll(async () => {
  await close()
})

describe('POST /api/v1/guilds/:id/channels', () => {
  it('creates a text channel with a normalized name at the end of its category', async () => {
    const category = channelNamed('Text Channels')

    const response = await call(owner, 'POST', `/guilds/${guild.id}/channels`, {
      type: 'text',
      name: 'Off Topic',
      parentId: category.id,
      topic: 'Anything goes',
    })

    expect(response.statusCode).toBe(201)
    expect(response.json().data.channel).toMatchObject({
      guildId: guild.id,
      type: 'text',
      name: 'off-topic',
      parentId: category.id,
      position: 1,
      topic: 'Anything goes',
    })
  })

  it('creates categories at the top level', async () => {
    const response = await call(owner, 'POST', `/guilds/${guild.id}/channels`, {
      type: 'category',
      name: 'Games',
    })

    expect(response.json().data.channel).toMatchObject({ parentId: null, position: 2 })
  })

  it('only nests channels under a category of the same server', async () => {
    const other = await createGuild(app, owner, 'Other')
    const foreignCategory = other.channels.find((c) => c.type === 'category')
    const textChannel = channelNamed('general')

    for (const parentId of [foreignCategory?.id, textChannel.id]) {
      const response = await call(owner, 'POST', `/guilds/${guild.id}/channels`, {
        type: 'text',
        name: 'x',
        parentId,
      })
      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({ code: 'INVALID_PARENT' })
    }
  })

  it('is reserved for the owner', async () => {
    const response = await call(member, 'POST', `/guilds/${guild.id}/channels`, {
      type: 'text',
      name: 'x',
    })
    expect(response.statusCode).toBe(403)
  })

  it('hides the server from outsiders', async () => {
    const response = await call(outsider, 'POST', `/guilds/${guild.id}/channels`, {
      type: 'text',
      name: 'x',
    })
    expect(response.statusCode).toBe(404)
  })
})

describe('GET /api/v1/channels/:id', () => {
  it('returns the channel to members', async () => {
    const response = await call(member, 'GET', `/channels/${channelNamed('general').id}`)

    expect(response.statusCode).toBe(200)
    expect(response.json().data.channel.name).toBe('general')
  })

  it('hides channels from outsiders', async () => {
    const response = await call(outsider, 'GET', `/channels/${channelNamed('general').id}`)

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ code: 'UNKNOWN_CHANNEL' })
  })
})

describe('PATCH /api/v1/channels/:id', () => {
  it('renames text channels using the text-channel rules', async () => {
    const response = await call(owner, 'PATCH', `/channels/${channelNamed('general').id}`, {
      name: 'Main Chat',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().data.channel.name).toBe('main-chat')
  })

  it('keeps voice channel names as typed', async () => {
    const response = await call(owner, 'PATCH', `/channels/${channelNamed('General').id}`, {
      name: 'Lounge Room',
    })
    expect(response.json().data.channel.name).toBe('Lounge Room')
  })

  it('sets and clears the topic', async () => {
    const id = channelNamed('general').id

    await call(owner, 'PATCH', `/channels/${id}`, { topic: 'Be nice' })
    const cleared = await call(owner, 'PATCH', `/channels/${id}`, { topic: null })

    expect(cleared.json().data.channel.topic).toBeNull()
  })

  it('moves a channel between categories and out of them', async () => {
    const id = channelNamed('general').id
    const voiceCategory = channelNamed('Voice Channels').id

    const moved = await call(owner, 'PATCH', `/channels/${id}`, { parentId: voiceCategory })
    const topLevel = await call(owner, 'PATCH', `/channels/${id}`, { parentId: null })

    expect(moved.json().data.channel.parentId).toBe(voiceCategory)
    expect(topLevel.json().data.channel.parentId).toBeNull()
  })

  it('rejects a name that normalizes to nothing', async () => {
    const response = await call(owner, 'PATCH', `/channels/${channelNamed('general').id}`, {
      name: ' -- ',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ code: 'VALIDATION_FAILED' })
  })

  it('does not nest categories', async () => {
    const response = await call(owner, 'PATCH', `/channels/${channelNamed('Text Channels').id}`, {
      parentId: channelNamed('Voice Channels').id,
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ code: 'INVALID_PARENT' })
  })

  it('is reserved for the owner', async () => {
    const response = await call(member, 'PATCH', `/channels/${channelNamed('general').id}`, {
      name: 'mine',
    })
    expect(response.statusCode).toBe(403)
  })
})

describe('DELETE /api/v1/channels/:id', () => {
  it('deletes a channel', async () => {
    const id = channelNamed('general').id

    expect((await call(owner, 'DELETE', `/channels/${id}`)).statusCode).toBe(204)
    expect((await listChannels()).map((c) => c.id)).not.toContain(id)
  })

  it('moves the children of a deleted category to the top level', async () => {
    await call(owner, 'DELETE', `/channels/${channelNamed('Text Channels').id}`)

    const general = (await listChannels()).find((c) => c.name === 'general')
    expect(general?.parentId).toBeNull()
  })

  it('is reserved for the owner', async () => {
    const response = await call(member, 'DELETE', `/channels/${channelNamed('general').id}`)
    expect(response.statusCode).toBe(403)
  })
})

describe('PATCH /api/v1/guilds/:id/channels (reorder)', () => {
  it('updates positions and parents in one request', async () => {
    const text = channelNamed('Text Channels')
    const voice = channelNamed('Voice Channels')
    const general = channelNamed('general')

    const response = await call(owner, 'PATCH', `/guilds/${guild.id}/channels`, [
      { id: voice.id, position: 0 },
      { id: text.id, position: 1 },
      { id: general.id, position: 3, parentId: voice.id },
    ])

    expect(response.statusCode).toBe(200)
    const after = Object.fromEntries((await listChannels()).map((c) => [c.id, c]))
    expect(after[voice.id]?.position).toBe(0)
    expect(after[text.id]?.position).toBe(1)
    expect(after[general.id]).toMatchObject({ position: 3, parentId: voice.id })
  })

  it('rejects channels from another server', async () => {
    const other = await createGuild(app, owner, 'Other')

    const response = await call(owner, 'PATCH', `/guilds/${guild.id}/channels`, [
      { id: other.channels[0]?.id, position: 0 },
    ])

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ code: 'UNKNOWN_CHANNEL' })
  })

  it('rejects non-category parents', async () => {
    const response = await call(owner, 'PATCH', `/guilds/${guild.id}/channels`, [
      { id: channelNamed('General').id, position: 0, parentId: channelNamed('general').id },
    ])
    expect(response.json()).toMatchObject({ code: 'INVALID_PARENT' })
  })

  it('is reserved for the owner', async () => {
    const response = await call(member, 'PATCH', `/guilds/${guild.id}/channels`, [
      { id: channelNamed('general').id, position: 0 },
    ])
    expect(response.statusCode).toBe(403)
  })
})
