import { Permission } from '@chinchi/shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'
import { createFakeRooms, signedWebhook, VOICE_ENV } from '../../../test/voice'

import type { TestActor } from '../../../test/guild-helpers'

const fake = createFakeRooms()
const { app, db, redis, events, close } = createTestApp({
  env: { ...VOICE_ENV, RATE_LIMIT: 'off' },
  voiceRooms: fake.rooms,
})

let owner: TestActor
let member: TestActor
let guild: Awaited<ReturnType<typeof createGuild>>
let voiceId: string
let secondVoiceId: string
let textId: string

const api = (actor: TestActor, method: 'POST' | 'PUT', url: string, payload?: object) =>
  app.inject({ method, url: `/api/v1${url}`, headers: actor.headers, payload: payload ?? {} })

const joined = async (userId: string, channelId: string) => {
  const { body, headers } = await signedWebhook({
    event: 'participant_joined',
    room: { name: `voice:${channelId}` },
    participant: { identity: userId, sid: `PA_${userId}` },
  })
  await app.inject({ method: 'POST', url: '/api/v1/voice/webhook', headers, payload: body })
}

const move = (actor: TestActor, target: TestActor, channelId: string) =>
  api(actor, 'POST', `/guilds/${guild.id}/members/${target.id}/voice/move`, { channelId })

const moves = () => events.published.filter((event) => event.type === 'VOICE_MOVE')

beforeEach(async () => {
  await resetState(db, redis)
  fake.clear()
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
  member = await signUp(app, { username: 'member', email: 'member@example.com' })
  guild = await createGuild(app, owner)
  await addMember(db, guild.id, member.id)
  voiceId = guild.channels.find((c) => c.type === 'voice')?.id as string
  textId = guild.channels.find((c) => c.type === 'text')?.id as string
  const second = await api(owner, 'POST', `/guilds/${guild.id}/channels`, {
    name: 'second',
    type: 'voice',
  })
  secondVoiceId = second.json().data.channel.id
  events.clear()
})

beforeAll(async () => {
  await app.listen({ host: '127.0.0.1', port: 0 })
})

afterAll(close)

describe('moving someone to another voice channel', () => {
  it('tells their client to switch channels', async () => {
    await joined(member.id, voiceId)

    const response = await move(owner, member, secondVoiceId)

    expect(response.statusCode).toBe(204)
    expect(moves()).toEqual([
      expect.objectContaining({
        topic: `user:${member.id}`,
        data: { guildId: guild.id, channelId: secondVoiceId },
      }),
    ])
  })

  it('only moves people who are in voice on this server, into a voice channel', async () => {
    const notIn = await move(owner, member, secondVoiceId)
    expect(notIn.json().code).toBe('NOT_IN_VOICE')

    await joined(member.id, voiceId)
    const text = await move(owner, member, textId)
    expect(text.json().code).toBe('INVALID_CHANNEL')
    const missing = await move(owner, member, '1')
    expect(missing.json().code).toBe('UNKNOWN_CHANNEL')
    expect(moves()).toEqual([])
  })

  it('needs MOVE_MEMBERS', async () => {
    await joined(owner.id, voiceId)

    const refused = await move(member, owner, secondVoiceId)

    expect(refused.statusCode).toBe(403)
    expect(moves()).toEqual([])
  })

  it('does not move anyone into a channel they may not join', async () => {
    await joined(member.id, voiceId)
    await api(owner, 'PUT', `/channels/${secondVoiceId}/permissions/${member.id}`, {
      targetType: 'member',
      allow: '0',
      deny: Permission.Connect.toString(),
    })

    const refused = await move(owner, member, secondVoiceId)

    expect(refused.json().code).toBe('CANNOT_CONNECT')
    expect(moves()).toEqual([])
  })
})
