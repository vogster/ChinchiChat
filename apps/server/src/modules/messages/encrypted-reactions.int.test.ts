import { randomBytes } from 'node:crypto'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { identify } from '../../../test/gateway-client'
import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

import type { TestSocket } from '../../../test/gateway-client'
import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, close } = createTestApp()
const sockets: TestSocket[] = []

let alice: TestActor
let bob: TestActor

const b64 = (bytes = 48) => randomBytes(bytes).toString('base64')
const call = (
  actor: TestActor,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  payload?: object,
) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: actor.headers,
    ...(payload ? { payload } : {}),
  })

const encryptedMessage = async () => {
  const channel = (
    await call(alice, 'POST', '/users/@me/channels', { recipientIds: [bob.id], encrypted: true })
  ).json().data.channel as { id: string }
  const message = (
    await call(alice, 'POST', `/channels/${channel.id}/messages`, { ciphertext: b64() })
  ).json().data.message as { id: string }
  return { channel, message, path: `/channels/${channel.id}/messages/${message.id}` }
}

beforeAll(async () => {
  await app.listen({ host: '127.0.0.1', port: 0 })
})

beforeEach(async () => {
  await resetState(db, redis)
  alice = await signUp(app, { username: 'alice', email: 'alice@example.com' })
  bob = await signUp(app, { username: 'bob', email: 'bob@example.com' })
  const guild = await createGuild(app, alice)
  await addMember(db, guild.id, bob.id)
})

afterAll(async () => {
  for (const socket of sockets) socket.close()
  await close()
})

describe('reactions in encrypted conversations', () => {
  it('are one encrypted set per person: the server keeps who, never which emoji', async () => {
    const { channel, message, path } = await encryptedMessage()
    const aliceSocket = (await identify(app, alice.cookie)).socket
    sockets.push(aliceSocket)
    const ciphertext = b64()

    const set = await call(bob, 'PUT', `${path}/e2ee-reactions/@me`, { ciphertext })
    expect(set.statusCode).toBe(204)
    expect(await aliceSocket.dispatch('E2EE_REACTION_UPDATE')).toMatchObject({
      channelId: channel.id,
      messageId: message.id,
      userId: bob.id,
      reaction: { ciphertext },
    })

    const history = (await call(alice, 'GET', `/channels/${channel.id}/messages`)).json().data
      .messages
    expect(history[0].reactions).toEqual([])
    expect(history[0].encryptedReactions).toEqual([
      { userId: bob.id, version: expect.any(String), ciphertext },
    ])

    // A change replaces the set; taking everything back removes it.
    const next = b64()
    await call(bob, 'PUT', `${path}/e2ee-reactions/@me`, { ciphertext: next })
    expect(
      (await call(alice, 'GET', `/channels/${channel.id}/messages`)).json().data.messages[0]
        .encryptedReactions[0].ciphertext,
    ).toBe(next)
    expect((await call(bob, 'DELETE', `${path}/e2ee-reactions/@me`)).statusCode).toBe(204)
    expect(
      (await call(alice, 'GET', `/channels/${channel.id}/messages`)).json().data.messages[0]
        .encryptedReactions,
    ).toEqual([])
  })

  it('refuse plain reactions there, and encrypted ones anywhere else', async () => {
    const { path } = await encryptedMessage()
    const plain = await call(bob, 'PUT', `${path}/reactions/${encodeURIComponent('👍')}/@me`)
    expect(plain.json().code).toBe('ENCRYPTED_CHANNEL')

    const dm = (await call(alice, 'POST', '/users/@me/channels', { recipientIds: [bob.id] })).json()
      .data.channel as { id: string }
    const message = (
      await call(alice, 'POST', `/channels/${dm.id}/messages`, { content: 'привет' })
    ).json().data.message as { id: string }
    const encrypted = await call(
      bob,
      'PUT',
      `/channels/${dm.id}/messages/${message.id}/e2ee-reactions/@me`,
      { ciphertext: b64() },
    )
    expect(encrypted.json().code).toBe('NOT_ENCRYPTED')
  })
})
