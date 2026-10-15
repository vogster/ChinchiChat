import { Permission } from '@chinchi/shared'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'
import { VOICE_ENV, createFakeRooms, readVoiceToken } from '../../../test/voice'

import type { TestActor } from '../../../test/guild-helpers'

const fake = createFakeRooms()
const { app, db, redis, close } = createTestApp({
  env: { ...VOICE_ENV, RATE_LIMIT: 'off' },
  voiceRooms: fake.rooms,
})
const disabled = createTestApp()

let owner: TestActor
let member: TestActor
let guild: Awaited<ReturnType<typeof createGuild>>
let voiceId: string
let textId: string

const join = (actor: TestActor, channelId: string, payload: object = {}, target = app) =>
  target.inject({
    method: 'POST',
    url: `/api/v1/channels/${channelId}/voice`,
    headers: actor.headers,
    payload,
  })

const deny = (channelId: string, flag: bigint) =>
  app.inject({
    method: 'PUT',
    url: `/api/v1/channels/${channelId}/permissions/${guild.id}`,
    headers: owner.headers,
    payload: { targetType: 'role', allow: '0', deny: flag.toString() },
  })

beforeEach(async () => {
  await resetState(db, redis)
  fake.clear()
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
  member = await signUp(app, { username: 'member', email: 'member@example.com' })
  guild = await createGuild(app, owner)
  await addMember(db, guild.id, member.id)
  voiceId = guild.channels.find((c) => c.type === 'voice')?.id as string
  textId = guild.channels.find((c) => c.type === 'text')?.id as string
})

afterAll(async () => {
  await Promise.all([close(), disabled.close()])
})

describe('POST /channels/:id/voice', () => {
  it('hands out a short token for the channel room with what the member may publish', async () => {
    const response = await join(member, voiceId)

    expect(response.statusCode).toBe(200)
    const { connection } = response.json().data
    expect(connection.url).toBe(VOICE_ENV.LIVEKIT_URL)
    const claims = await readVoiceToken(connection.token)
    expect(claims.sub).toBe(member.id)
    expect(claims.name).toBe('member')
    expect(claims.video).toMatchObject({
      room: `voice:${voiceId}`,
      roomJoin: true,
      canSubscribe: true,
      canPublish: true,
      canPublishData: false,
      canPublishSources: ['microphone', 'camera', 'screen_share', 'screen_share_audio'],
    })
    expect(Number(claims.exp) - Number(claims.nbf ?? claims.iat ?? 0)).toBeLessThanOrEqual(600)
  })

  it('leaves out the microphone without SPEAK, and camera and screen without VIDEO', async () => {
    await deny(voiceId, Permission.Speak | Permission.Video)

    const { connection } = (await join(member, voiceId)).json().data
    const claims = await readVoiceToken(connection.token)

    expect(claims.video?.canPublishSources).toEqual([])
    expect(claims.video?.canSubscribe).toBe(true)
  })

  it('needs CONNECT, a voice channel the user can see, and voice set up', async () => {
    expect((await join(member, textId)).json().code).toBe('INVALID_CHANNEL')

    await deny(voiceId, Permission.Connect)
    const refused = await join(member, voiceId)
    expect(refused.statusCode).toBe(403)
    expect(refused.json().code).toBe('MISSING_PERMISSIONS')

    await deny(voiceId, Permission.ViewChannel)
    expect((await join(member, voiceId)).statusCode).toBe(404)

    const off = await join(member, voiceId, {}, disabled.app)
    expect(off.statusCode).toBe(400)
    expect(off.json().code).toBe('VOICE_DISABLED')
  })

  it('reports in instance info whether voice is available', async () => {
    const on = await app.inject({ method: 'GET', url: '/api/v1/instance' })
    const off = await disabled.app.inject({ method: 'GET', url: '/api/v1/instance' })

    expect(on.json().data.instance.voice).toBe(true)
    expect(off.json().data.instance.voice).toBe(false)
  })
})
