import { generateKeyPairSync, randomBytes, sign } from 'node:crypto'

import { deviceStatement } from '@chinchi/shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

import type { TestActor } from '../../../test/guild-helpers'
import type { KeyObject } from 'node:crypto'

const { app, db, redis, events, close } = createTestApp()

let alice: TestActor
let bob: TestActor
let outsider: TestActor

const call = (actor: TestActor, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: actor.headers,
    ...(payload ? { payload } : {}),
  })

/** An Ed25519 key pair with its public half as the API wants it (32 bytes, base64). */
const keyPair = () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const raw = Buffer.from(publicKey.export({ format: 'jwk' }).x as string, 'base64url')
  return { publicKey: raw.toString('base64'), privateKey }
}

const signDevice = (
  userKey: KeyObject,
  device: { id: string; userId: string; signaturePublicKey: string },
) =>
  sign(
    null,
    Buffer.from(deviceStatement(device.userId, device.id, device.signaturePublicKey)),
    userKey,
  ).toString('base64')

const register = async (actor: TestActor) =>
  (
    await call(actor, 'POST', '/users/@me/devices', {
      name: 'Браузер',
      signaturePublicKey: randomBytes(32).toString('base64'),
    })
  ).json().data.device as { id: string; userId: string; signaturePublicKey: string }

beforeAll(async () => {
  await app.listen({ host: '127.0.0.1', port: 0 })
})

beforeEach(async () => {
  await resetState(db, redis)
  events.clear()
  alice = await signUp(app, { username: 'alice', email: 'alice@example.com' })
  bob = await signUp(app, { username: 'bob', email: 'bob@example.com' })
  outsider = await signUp(app, { username: 'outsider', email: 'outsider@example.com' })
  const guild = await createGuild(app, alice)
  await addMember(db, guild.id, bob.id)
})

afterAll(close)

describe('user keys', () => {
  it('are set once, seen by people one may reach, and replaced only on purpose', async () => {
    expect((await call(alice, 'GET', '/users/@me/e2ee/user-key')).json().data.userKey).toBeNull()
    const first = keyPair()

    const created = await call(alice, 'PUT', '/users/@me/e2ee/user-key', {
      publicKey: first.publicKey,
    })
    expect(created.json().data.userKey).toMatchObject({
      userId: alice.id,
      publicKey: first.publicKey,
    })
    const again = await call(alice, 'PUT', '/users/@me/e2ee/user-key', {
      publicKey: keyPair().publicKey,
    })
    expect(again.json().code).toBe('USER_KEY_EXISTS')

    const seen = await call(bob, 'GET', `/users/${alice.id}/e2ee/user-key`)
    expect(seen.json().data.userKey.publicKey).toBe(first.publicKey)
    expect((await call(outsider, 'GET', `/users/${alice.id}/e2ee/user-key`)).statusCode).toBe(404)
  })

  it('sign devices: only a valid signature by the current key is kept', async () => {
    const device = await register(alice)
    const path = `/users/@me/devices/${device.id}/signature`
    const userKey = keyPair()
    const early = await call(alice, 'PUT', path, {
      signature: signDevice(userKey.privateKey, device),
    })
    expect(early.json().code).toBe('NO_USER_KEY')

    await call(alice, 'PUT', '/users/@me/e2ee/user-key', { publicKey: userKey.publicKey })
    const forged = await call(alice, 'PUT', path, {
      signature: signDevice(keyPair().privateKey, device),
    })
    expect(forged.json().code).toBe('INVALID_SIGNATURE')
    const signature = signDevice(userKey.privateKey, device)
    expect((await call(alice, 'PUT', path, { signature })).statusCode).toBe(204)

    const listed = (await call(bob, 'GET', `/users/${alice.id}/devices`)).json().data.devices
    expect(listed[0]).toMatchObject({ id: device.id, userSignature: signature })
    // Someone else's device can't be signed with my key.
    const bobDevice = await register(bob)
    const other = await call(alice, 'PUT', `/users/@me/devices/${bobDevice.id}/signature`, {
      signature: signDevice(userKey.privateKey, bobDevice),
    })
    expect(other.statusCode).toBe(404)
  })

  it('when replaced, drop every signature and tell the people who follow the user', async () => {
    const device = await register(alice)
    const userKey = keyPair()
    await call(alice, 'PUT', '/users/@me/e2ee/user-key', { publicKey: userKey.publicKey })
    await call(alice, 'PUT', `/users/@me/devices/${device.id}/signature`, {
      signature: signDevice(userKey.privateKey, device),
    })
    events.clear()

    const replaced = await call(alice, 'PUT', '/users/@me/e2ee/user-key', {
      publicKey: keyPair().publicKey,
      replace: true,
    })

    expect(replaced.statusCode).toBe(200)
    const listed = (await call(alice, 'GET', '/users/@me/devices')).json().data.devices
    expect(listed[0].userSignature).toBeNull()
    expect(events.published).toContainEqual(
      expect.objectContaining({ type: 'E2EE_DEVICES_UPDATE', data: { userId: alice.id } }),
    )
  })
})
