import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { identify } from '../../../test/gateway-client'
import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

import type { TestSocket } from '../../../test/gateway-client'
import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, events, close } = createTestApp()
const sockets: TestSocket[] = []

let owner: TestActor
let member: TestActor

const put = (actor: TestActor, payload: object) =>
  app.inject({
    method: 'PUT',
    url: '/api/v1/users/@me/custom-status',
    headers: actor.headers,
    payload,
  })

const connect = async (actor: TestActor) => {
  const connection = await identify(app, actor.cookie)
  sockets.push(connection.socket)
  return connection
}

beforeAll(async () => {
  await app.listen({ host: '127.0.0.1', port: 0 })
})

beforeEach(async () => {
  await resetState(db, redis)
  events.clear()
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
  member = await signUp(app, { username: 'member', email: 'member@example.com' })
  const guild = await createGuild(app, owner)
  await addMember(db, guild.id, member.id)
})

afterEach(() => {
  for (const socket of sockets.splice(0)) socket.close()
})

afterAll(async () => {
  await close()
})

describe('custom status', () => {
  it('shows to server mates and comes back in READY', async () => {
    await connect(member)
    const { socket } = await connect(owner)

    const response = await put(member, { text: 'В отпуске', emoji: '🏖️' })

    expect(response.statusCode).toBe(200)
    const customStatus = { text: 'В отпуске', emoji: '🏖️', expiresAt: null }
    expect(response.json().data.customStatus).toEqual(customStatus)
    expect(
      await socket.next(
        (frame) =>
          frame.t === 'PRESENCE_UPDATE' &&
          (frame.d as { userId: string }).userId === member.id &&
          'customStatus' in (frame.d as object),
      ),
    ).toMatchObject({ d: { userId: member.id, status: 'online', customStatus } })

    const own = await connect(member)
    expect(own.ready).toMatchObject({ customStatus })
    const other = await connect(owner)
    expect(other.ready.presences).toEqual(
      expect.arrayContaining([{ userId: member.id, status: 'online', customStatus }]),
    )
  })

  it('clears', async () => {
    await put(member, { text: 'Обедаю' })

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/users/@me/custom-status',
      headers: member.headers,
    })

    expect(response.statusCode).toBe(204)
    expect((await connect(member)).ready).toMatchObject({ customStatus: null })
  })

  it('needs an end in the future and within a month', async () => {
    const past = await put(member, {
      text: 'x',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    })
    expect(past.json().code).toBe('INVALID_STATUS_END')
    const far = await put(member, {
      text: 'x',
      expiresAt: new Date(Date.now() + 31 * 86_400_000).toISOString(),
    })
    expect(far.json().code).toBe('INVALID_STATUS_END')
    expect((await put(member, { emoji: 'no' })).statusCode).toBe(400)
  })

  it('requires signing in', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/users/@me/custom-status',
      payload: { text: 'x' },
    })
    expect(response.statusCode).toBe(401)
  })
})
