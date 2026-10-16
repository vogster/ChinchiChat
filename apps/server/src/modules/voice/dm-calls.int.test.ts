import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { identify } from '../../../test/gateway-client'
import { signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'
import { createFakeRooms, readVoiceToken, signedWebhook, VOICE_ENV } from '../../../test/voice'

import type { TestActor } from '../../../test/guild-helpers'

const fake = createFakeRooms()
const { app, db, redis, events, close } = createTestApp({
  env: { ...VOICE_ENV, RATE_LIMIT: 'off' },
  voiceRooms: fake.rooms,
})

let alice: TestActor
let bob: TestActor
let carol: TestActor
let dmId: string

const api = (actor: TestActor, method: 'POST' | 'PUT', url: string, payload: object = {}) =>
  app.inject({ method, url: `/api/v1${url}`, headers: actor.headers, payload })

const webhook = async (event: string, userId: string) => {
  const { body, headers } = await signedWebhook({
    event,
    room: { name: `dm:${dmId}` },
    participant: { identity: userId, sid: `PA_${userId}` },
  })
  return app.inject({ method: 'POST', url: '/api/v1/voice/webhook', headers, payload: body })
}

const voiceEvents = () =>
  events.published
    .filter((event) => event.type === 'VOICE_STATE_UPDATE')
    .map((event) => ({ topic: event.topic, data: event.data as Record<string, unknown> }))

beforeAll(async () => {
  await app.listen({ host: '127.0.0.1', port: 0 })
})

beforeEach(async () => {
  await resetState(db, redis)
  fake.clear()
  alice = await signUp(app, { username: 'alice', email: 'alice@example.com' })
  bob = await signUp(app, { username: 'bob', email: 'bob@example.com' })
  carol = await signUp(app, { username: 'carol', email: 'carol@example.com' })
  await api(alice, 'POST', '/users/@me/relationships', { username: 'bob' })
  await api(bob, 'PUT', `/users/@me/relationships/${alice.id}`, { type: 'friend' })
  dmId = (await api(alice, 'POST', '/users/@me/channels', { recipientIds: [bob.id] })).json().data
    .channel.id
  events.clear()
})

afterAll(async () => {
  await close()
})

describe('calls in DMs', () => {
  it('give members a token for the DM room', async () => {
    const response = await api(alice, 'POST', `/channels/${dmId}/voice`)

    expect(response.statusCode).toBe(200)
    const claims = await readVoiceToken(response.json().data.connection.token)
    expect(claims.video).toMatchObject({
      room: `dm:${dmId}`,
      canPublishSources: ['microphone', 'camera', 'screen_share', 'screen_share_audio'],
    })
    expect((await api(carol, 'POST', `/channels/${dmId}/voice`)).statusCode).toBe(404)
  })

  it('ring the other side: who is in the call reaches every member of the DM', async () => {
    await webhook('participant_joined', alice.id)

    expect(voiceEvents()).toEqual(
      [alice, bob].map((user) => ({
        topic: `user:${user.id}`,
        data: expect.objectContaining({ guildId: null, channelId: dmId, userId: alice.id }),
      })),
    )

    const { socket, ready } = await identify(app, bob.cookie)
    socket.close()
    expect((ready as unknown as { voiceStates: unknown[] }).voiceStates).toEqual([
      expect.objectContaining({ channelId: dmId, userId: alice.id }),
    ])

    events.clear()
    await webhook('participant_left', alice.id)
    expect(voiceEvents().map((e) => e.data.channelId)).toEqual([null, null])
  })

  it('stop across a block', async () => {
    await api(bob, 'PUT', `/users/@me/relationships/${alice.id}`, { type: 'blocked' })

    const refused = await api(alice, 'POST', `/channels/${dmId}/voice`)
    expect(refused.statusCode).toBe(403)

    await webhook('participant_joined', alice.id)
    expect(fake.callsOf('removeParticipant')).toEqual([
      { method: 'removeParticipant', room: `dm:${dmId}`, identity: alice.id },
    ])
  })
})

describe('DM calls after a block', () => {
  it('end the call for whoever is in it', async () => {
    await webhook('participant_joined', alice.id)
    fake.clear()

    await api(bob, 'PUT', `/users/@me/relationships/${alice.id}`, { type: 'blocked' })

    await expect
      .poll(() => fake.callsOf('removeParticipant'))
      .toContainEqual({ method: 'removeParticipant', room: `dm:${dmId}`, identity: alice.id })
  })
})
