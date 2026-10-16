import { Permission } from '@chinchi/shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { identify } from '../../../test/gateway-client'
import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'
import { createFakeRooms, readVoiceToken, signedWebhook, VOICE_ENV } from '../../../test/voice'

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

const api = (actor: TestActor, method: 'POST' | 'PATCH' | 'PUT', url: string, payload?: object) =>
  app.inject({ method, url: `/api/v1${url}`, headers: actor.headers, payload: payload ?? {} })

const webhook = async (event: Record<string, unknown>) => {
  const { body, headers } = await signedWebhook(event)
  return app.inject({ method: 'POST', url: '/api/v1/voice/webhook', headers, payload: body })
}

/** Each LiveKit connection has its own sid; by default one connection per user. */
const joined = (userId: string, channelId: string, sid = `PA_${userId}`) =>
  webhook({
    event: 'participant_joined',
    room: { name: `voice:${channelId}` },
    participant: { identity: userId, sid },
  })

const left = (userId: string, channelId: string, sid = `PA_${userId}`) =>
  webhook({
    event: 'participant_left',
    room: { name: `voice:${channelId}` },
    participant: { identity: userId, sid },
  })

const track = (event: 'track_published' | 'track_unpublished', userId: string, source: string) =>
  webhook({
    event,
    room: { name: `voice:${voiceId}` },
    participant: { identity: userId, sid: `PA_${userId}` },
    track: { sid: 'TR_1', source },
  })

const voiceEvents = () =>
  events.published
    .filter((event) => event.type === 'VOICE_STATE_UPDATE')
    .map((event) => ({ topic: event.topic, data: event.data as Record<string, unknown> }))

const lastState = () => voiceEvents().at(-1)?.data

beforeEach(async () => {
  await resetState(db, redis)
  fake.clear()
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
  member = await signUp(app, { username: 'member', email: 'member@example.com' })
  guild = await createGuild(app, owner)
  await addMember(db, guild.id, member.id)
  voiceId = guild.channels.find((c) => c.type === 'voice')?.id as string
  const category = guild.channels.find((c) => c.type === 'category')?.id as string
  const second = await api(owner, 'POST', `/guilds/${guild.id}/channels`, {
    name: 'second',
    type: 'voice',
    parentId: category,
  })
  secondVoiceId = second.json().data.channel.id
  events.clear()
})

beforeAll(async () => {
  await app.listen({ host: '127.0.0.1', port: 0 })
})

afterAll(async () => {
  await close()
})

describe('LiveKit webhooks', () => {
  it('only accept requests LiveKit signed', async () => {
    const unsigned = await app.inject({
      method: 'POST',
      url: '/api/v1/voice/webhook',
      headers: { 'content-type': 'application/webhook+json' },
      payload: JSON.stringify({ event: 'participant_joined' }),
    })
    expect(unsigned.statusCode).toBe(401)

    const { body, headers } = await signedWebhook({ event: 'room_started' })
    const tampered = await app.inject({
      method: 'POST',
      url: '/api/v1/voice/webhook',
      headers,
      payload: body.replace('room_started', 'room_finished'),
    })
    expect(tampered.statusCode).toBe(401)
  })

  it('announce who joined and left, with the mute they joined with', async () => {
    await api(member, 'POST', `/channels/${voiceId}/voice`, { selfMute: true })

    expect((await joined(member.id, voiceId)).statusCode).toBe(200)

    expect(voiceEvents()).toEqual([
      {
        topic: `guild:${guild.id}`,
        data: {
          guildId: guild.id,
          channelId: voiceId,
          userId: member.id,
          selfMute: true,
          selfDeaf: false,
          serverMute: false,
          serverDeaf: false,
          video: false,
          stream: false,
        },
      },
    ])

    await left(member.id, voiceId)
    expect(lastState()).toMatchObject({ userId: member.id, channelId: null })
  })

  it('ignore a late leave from a channel the user already moved out of', async () => {
    await joined(member.id, voiceId, 'PA_first')
    await joined(member.id, secondVoiceId, 'PA_second')
    events.clear()

    await left(member.id, voiceId, 'PA_first')

    expect(voiceEvents()).toEqual([])
  })

  it('throw out whoever joins without CONNECT', async () => {
    await api(owner, 'PUT', `/channels/${voiceId}/permissions/${guild.id}`, {
      targetType: 'role',
      allow: '0',
      deny: Permission.Connect.toString(),
    })

    await joined(member.id, voiceId)

    expect(fake.callsOf('removeParticipant')).toEqual([
      { method: 'removeParticipant', room: `voice:${voiceId}`, identity: member.id },
    ])
    expect(voiceEvents()).toEqual([])
  })

  it('follow the camera and the screen share', async () => {
    await joined(member.id, voiceId)

    await track('track_published', member.id, 'CAMERA')
    expect(lastState()).toMatchObject({ video: true, stream: false })
    await track('track_published', member.id, 'SCREEN_SHARE')
    expect(lastState()).toMatchObject({ video: true, stream: true })
    await track('track_unpublished', member.id, 'CAMERA')
    expect(lastState()).toMatchObject({ video: false, stream: true })
  })
})

describe('deleting a voice channel', () => {
  it('disconnects everyone in it', async () => {
    await joined(member.id, voiceId)

    await app.inject({
      method: 'DELETE',
      url: `/api/v1/channels/${voiceId}`,
      headers: owner.headers,
    })

    expect(fake.callsOf('removeParticipant')).toEqual([
      { method: 'removeParticipant', room: `voice:${voiceId}`, identity: member.id },
    ])
  })
})

describe('own voice state', () => {
  it('changes mute and deafen while connected', async () => {
    const notIn = await api(member, 'PATCH', '/users/@me/voice-state', { selfMute: true })
    expect(notIn.json().code).toBe('NOT_IN_VOICE')

    await joined(member.id, voiceId)
    const response = await api(member, 'PATCH', '/users/@me/voice-state', { selfDeaf: true })

    expect(response.statusCode).toBe(204)
    expect(lastState()).toMatchObject({ selfDeaf: true, selfMute: false })
  })

  it('leaves the previous channel when joining another one', async () => {
    await joined(member.id, voiceId)

    await api(member, 'POST', `/channels/${secondVoiceId}/voice`)

    expect(fake.callsOf('removeParticipant')).toEqual([
      { method: 'removeParticipant', room: `voice:${voiceId}`, identity: member.id },
    ])
  })
})

describe('moderation', () => {
  it('server mute and deafen apply at once and survive rejoining', async () => {
    await joined(member.id, voiceId)

    const muted = await api(owner, 'PATCH', `/guilds/${guild.id}/members/${member.id}/voice`, {
      mute: true,
      deaf: true,
    })

    expect(muted.statusCode).toBe(204)
    expect(fake.callsOf('setPermissions').at(-1)).toEqual({
      method: 'setPermissions',
      room: `voice:${voiceId}`,
      identity: member.id,
      args: { sources: ['camera', 'screen_share', 'screen_share_audio'], canSubscribe: false },
    })
    expect(lastState()).toMatchObject({ serverMute: true, serverDeaf: true })

    const { connection } = (await api(member, 'POST', `/channels/${voiceId}/voice`)).json().data
    const claims = await readVoiceToken(connection.token)
    expect(claims.video?.canPublishSources).not.toContain('microphone')
    expect(claims.video?.canSubscribe).toBe(false)
  })

  it('disconnects people', async () => {
    await joined(member.id, voiceId)

    await api(owner, 'PATCH', `/guilds/${guild.id}/members/${member.id}/voice`, {
      disconnect: true,
    })

    expect(fake.callsOf('removeParticipant')).toEqual([
      { method: 'removeParticipant', room: `voice:${voiceId}`, identity: member.id },
    ])
  })

  it('needs MUTE_MEMBERS, DEAFEN_MEMBERS and MOVE_MEMBERS', async () => {
    for (const payload of [{ mute: true }, { deaf: true }, { disconnect: true }]) {
      const refused = await api(
        member,
        'PATCH',
        `/guilds/${guild.id}/members/${owner.id}/voice`,
        payload,
      )
      expect(refused.statusCode).toBe(403)
    }
  })
})

describe('READY', () => {
  it('lists who is in the voice channels the user can see', async () => {
    await joined(member.id, voiceId)
    await joined(owner.id, secondVoiceId)
    await api(owner, 'PUT', `/channels/${secondVoiceId}/permissions/${member.id}`, {
      targetType: 'member',
      allow: '0',
      deny: Permission.ViewChannel.toString(),
    })

    const { socket, ready } = await identify(app, member.cookie)
    socket.close()

    expect((ready as unknown as { voiceStates: unknown[] }).voiceStates).toEqual([
      expect.objectContaining({ userId: member.id, channelId: voiceId }),
    ])
  })
})
