import { Permission } from '@chinchi/shared'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

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

const api = (
  actor: TestActor,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  payload?: object,
) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: actor.headers,
    ...(payload ? { payload } : {}),
  })

const send = async (event: Record<string, unknown>) => {
  const { body, headers } = await signedWebhook(event)
  return app.inject({ method: 'POST', url: '/api/v1/voice/webhook', headers, payload: body })
}

const participant = (event: string, userId: string, sid: string) =>
  send({ event, room: { name: `voice:${voiceId}` }, participant: { identity: userId, sid } })

const statesNow = async (actor: TestActor) => {
  const states = await app.voice.statesIn(guild.id, new Set([voiceId]))
  return states.filter((state) => state.userId === actor.id)
}

const leaves = () =>
  events.published.filter(
    (e) =>
      e.type === 'VOICE_STATE_UPDATE' &&
      (e.data as { channelId: string | null }).channelId === null,
  )

beforeEach(async () => {
  await resetState(db, redis)
  fake.clear()
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
  member = await signUp(app, { username: 'member', email: 'member@example.com' })
  guild = await createGuild(app, owner)
  await addMember(db, guild.id, member.id)
  voiceId = guild.channels.find((c) => c.type === 'voice')?.id as string
  events.clear()
})

afterAll(async () => {
  await close()
})

describe('webhooks out of order', () => {
  it('ignore a join that arrives after the same connection already left', async () => {
    await participant('participant_left', member.id, 'PA_quick')
    await participant('participant_joined', member.id, 'PA_quick')

    expect(await statesNow(member)).toEqual([])
  })

  it('keep a new connection when the replaced one reports leaving late', async () => {
    await participant('participant_joined', member.id, 'PA_old')
    await participant('participant_joined', member.id, 'PA_new')

    await participant('participant_left', member.id, 'PA_old')

    expect(await statesNow(member)).toHaveLength(1)
  })

  it('handle each delivery once', async () => {
    await participant('participant_joined', member.id, 'PA_1')
    const { body, headers } = await signedWebhook({
      id: 'EV_fixed',
      event: 'participant_left',
      room: { name: `voice:${voiceId}` },
      participant: { identity: member.id, sid: 'PA_1' },
    })
    await app.inject({ method: 'POST', url: '/api/v1/voice/webhook', headers, payload: body })
    await participant('participant_joined', member.id, 'PA_2')
    events.clear()

    await app.inject({ method: 'POST', url: '/api/v1/voice/webhook', headers, payload: body })

    expect(await statesNow(member)).toHaveLength(1)
  })

  it('apply current rights at once on joining (a mute made while connecting)', async () => {
    await api(owner, 'PATCH', `/guilds/${guild.id}/members/${member.id}/voice`, { mute: true })

    await participant('participant_joined', member.id, 'PA_1')

    expect(fake.callsOf('setPermissions').at(-1)?.args).toEqual({
      sources: ['camera', 'screen_share', 'screen_share_audio'],
      canSubscribe: true,
    })
  })
})

describe('staying in step with LiveKit', () => {
  it('empties a room LiveKit closed', async () => {
    await participant('participant_joined', member.id, 'PA_1')

    await send({ event: 'room_finished', room: { name: `voice:${voiceId}` } })

    expect(await statesNow(member)).toEqual([])
    expect(leaves()).toHaveLength(1)
  })

  it('drops connections LiveKit no longer has, keeps the rest', async () => {
    await participant('participant_joined', member.id, 'PA_gone')
    await participant('participant_joined', owner.id, 'PA_here')
    fake.participants.set(`voice:${voiceId}`, [{ identity: owner.id, sid: 'PA_here' }])

    await app.voice.reconcile()

    expect(await statesNow(member)).toEqual([])
    expect(await statesNow(owner)).toHaveLength(1)
  })
})

describe('losing access during a call', () => {
  it('disconnects whoever can no longer connect to the channel', async () => {
    await participant('participant_joined', member.id, 'PA_1')

    await api(owner, 'PUT', `/channels/${voiceId}/permissions/${guild.id}`, {
      targetType: 'role',
      allow: '0',
      deny: Permission.Connect.toString(),
    })

    await expect
      .poll(() => fake.callsOf('removeParticipant'))
      .toEqual([{ method: 'removeParticipant', room: `voice:${voiceId}`, identity: member.id }])
  })

  it('takes the microphone away when SPEAK is withdrawn', async () => {
    await participant('participant_joined', member.id, 'PA_1')
    fake.clear()

    await api(owner, 'PUT', `/channels/${voiceId}/permissions/${guild.id}`, {
      targetType: 'role',
      allow: '0',
      deny: Permission.Speak.toString(),
    })

    await expect
      .poll(() => fake.callsOf('setPermissions').find((c) => c.identity === member.id)?.args)
      .toEqual({ sources: ['camera', 'screen_share', 'screen_share_audio'], canSubscribe: true })
  })

  it('disconnects people who leave the server', async () => {
    await participant('participant_joined', member.id, 'PA_1')

    await api(member, 'DELETE', `/guilds/${guild.id}/members/@me`)

    // Several events report the leave; disconnecting twice is harmless.
    await expect
      .poll(() => fake.callsOf('removeParticipant').some((c) => c.identity === member.id))
      .toBe(true)
  })
})

describe('accounts losing access', () => {
  it('disconnects someone an admin suspends', async () => {
    await participant('participant_joined', member.id, 'PA_1')

    // owner registered first, so runs the instance.
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${member.id}`,
      headers: owner.headers,
      payload: { suspended: true },
    })

    await expect
      .poll(() => fake.callsOf('removeParticipant').some((c) => c.identity === member.id))
      .toBe(true)
  })
})

describe('moderation and the role hierarchy', () => {
  it('lets nobody below or level with the target moderate them, nor anyone touch the owner', async () => {
    const roleId = (
      await api(owner, 'POST', `/guilds/${guild.id}/roles`, {
        name: 'mods',
        permissions: (Permission.MuteMembers | Permission.MoveMembers).toString(),
      })
    ).json().data.role.id
    await api(owner, 'PUT', `/guilds/${guild.id}/members/${member.id}/roles/${roleId}`)

    const onOwner = await api(member, 'PATCH', `/guilds/${guild.id}/members/${owner.id}/voice`, {
      mute: true,
    })
    expect(onOwner.statusCode).toBe(403)
    expect(onOwner.json().code).toBe('ROLE_HIERARCHY')

    const third = await signUp(app, { username: 'third', email: 'third@example.com' })
    await addMember(db, guild.id, third.id)
    const onPlain = await api(member, 'PATCH', `/guilds/${guild.id}/members/${third.id}/voice`, {
      mute: true,
    })
    expect(onPlain.statusCode).toBe(204)
  })
})
