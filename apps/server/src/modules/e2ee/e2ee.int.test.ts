import { randomBytes } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { identify } from '../../../test/gateway-client'
import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

import type { TestSocket } from '../../../test/gateway-client'
import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, events, close } = createTestApp()
const sockets: TestSocket[] = []

let alice: TestActor
let bob: TestActor
let outsider: TestActor

const b64 = (bytes = 64) => randomBytes(bytes).toString('base64')

const call = (
  actor: TestActor,
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH',
  url: string,
  payload?: object,
) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: actor.headers,
    ...(payload ? { payload } : {}),
  })

const register = async (actor: TestActor, name = 'Браузер') => {
  const response = await call(actor, 'POST', '/users/@me/devices', {
    name,
    signaturePublicKey: b64(32),
  })
  return response.json().data.device as { id: string; userId: string }
}

const upload = (actor: TestActor, deviceId: string, packages: string[], lastResort?: string) =>
  call(actor, 'POST', `/users/@me/devices/${deviceId}/key-packages`, {
    packages,
    ...(lastResort ? { lastResort } : {}),
  })

const openEncrypted = async (actor: TestActor, recipientIds: string[]) =>
  (await call(actor, 'POST', '/users/@me/channels', { recipientIds, encrypted: true })).json().data
    .channel as { id: string; encrypted: boolean; type: string }

beforeAll(async () => {
  await app.listen({ host: '127.0.0.1', port: 0 })
})

beforeEach(async () => {
  await resetState(db, redis)
  events.clear()
  alice = await signUp(app, { username: 'alice', email: 'alice@example.com' })
  bob = await signUp(app, { username: 'bob', email: 'bob@example.com' })
  outsider = await signUp(app, { username: 'outsider', email: 'outsider@example.com' })
  // Alice and Bob share a server, so they may message each other.
  const guild = await createGuild(app, alice)
  await addMember(db, guild.id, bob.id)
})

afterEach(() => {
  for (const socket of sockets.splice(0)) socket.close()
})

afterAll(async () => {
  await close()
})

describe('devices', () => {
  it('are registered, listed to people one may message and revoked', async () => {
    const laptop = await register(alice, 'Ноутбук')
    await register(alice, 'Телефон')

    const own = (await call(alice, 'GET', '/users/@me/devices')).json().data.devices
    expect(own.map((d: { name: string }) => d.name).sort()).toEqual(['Ноутбук', 'Телефон'])
    const seen = await call(bob, 'GET', `/users/${alice.id}/devices`)
    expect(seen.json().data.devices).toHaveLength(2)
    expect((await call(outsider, 'GET', `/users/${alice.id}/devices`)).statusCode).toBe(404)

    expect((await call(alice, 'DELETE', `/users/@me/devices/${laptop.id}`)).statusCode).toBe(204)
    // Still listed (members recognise it in history), but revoked: no key packages, no commits.
    const after = (await call(alice, 'GET', '/users/@me/devices')).json().data.devices
    expect(after.find((d: { id: string }) => d.id === laptop.id).revokedAt).toEqual(
      expect.any(String),
    )
    expect((await upload(alice, laptop.id, [b64()])).statusCode).toBe(404)
    expect((await call(alice, 'DELETE', `/users/@me/devices/${laptop.id}`)).statusCode).toBe(404)
  })

  it('hand back the same device when its owner registers the key again', async () => {
    const key = b64(32)
    const first = await call(alice, 'POST', '/users/@me/devices', {
      name: 'a',
      signaturePublicKey: key,
    })
    // A page reloaded mid-registration retries with the key it saved first.
    const again = await call(alice, 'POST', '/users/@me/devices', {
      name: 'b',
      signaturePublicKey: key,
    })
    expect(again.statusCode).toBe(first.statusCode)
    expect(again.json().data.device.id).toBe(first.json().data.device.id)
    expect((await call(alice, 'GET', '/users/@me/devices')).json().data.devices).toHaveLength(1)
  })

  it('refuse a key registered by someone else or revoked', async () => {
    const key = b64(32)
    const first = await call(alice, 'POST', '/users/@me/devices', {
      name: 'a',
      signaturePublicKey: key,
    })
    const stolen = await call(bob, 'POST', '/users/@me/devices', {
      name: 'b',
      signaturePublicKey: key,
    })
    expect(stolen.json().code).toBe('DEVICE_EXISTS')

    await call(alice, 'DELETE', `/users/@me/devices/${first.json().data.device.id}`)
    const revived = await call(alice, 'POST', '/users/@me/devices', {
      name: 'a',
      signaturePublicKey: key,
    })
    expect(revived.json().code).toBe('DEVICE_EXISTS')
  })
})

describe('key packages', () => {
  it('are handed out once each, one per device, then the last resort', async () => {
    const device = await register(bob)
    const [first, second, last] = [b64(), b64(), b64()]
    expect(
      (await upload(bob, device.id, [first as string, second as string], last)).statusCode,
    ).toBe(204)
    expect(
      (await call(bob, 'GET', `/users/@me/devices/${device.id}/key-packages/count`)).json().data
        .count,
    ).toBe(2)

    const claim = async () =>
      (await call(alice, 'POST', `/users/${bob.id}/key-packages/claim`)).json().data
        .keyPackages as {
        deviceId: string
        package: string
      }[]
    const claimed = [await claim(), await claim(), await claim(), await claim()].map(
      (list) => list[0]?.package,
    )

    expect(claimed.slice(0, 2).sort()).toEqual([first, second].sort())
    expect(claimed.slice(2)).toEqual([last, last])
  })

  it('belong only to their own devices', async () => {
    const device = await register(bob)
    expect((await upload(alice, device.id, [b64()])).statusCode).toBe(404)
    expect((await call(outsider, 'POST', `/users/${bob.id}/key-packages/claim`)).statusCode).toBe(
      404,
    )
  })
})

describe('encrypted conversations', () => {
  it('are a channel of their own, never the plain DM', async () => {
    const plain = (
      await call(alice, 'POST', '/users/@me/channels', { recipientIds: [bob.id] })
    ).json().data.channel
    const encrypted = await openEncrypted(alice, [bob.id])

    expect(encrypted).toMatchObject({ type: 'dm', encrypted: true })
    expect(encrypted.id).not.toBe(plain.id)
  })

  it('are one per pair: opening again, from either side or at once, finds the same one', async () => {
    const [first, second] = await Promise.all([
      openEncrypted(alice, [bob.id]),
      openEncrypted(alice, [bob.id]),
    ])
    expect(second.id).toBe(first.id)
    expect((await openEncrypted(bob, [alice.id])).id).toBe(first.id)
    const listed = (await call(bob, 'GET', '/users/@me/channels')).json().data.channels
    expect(listed.filter((c: { encrypted: boolean }) => c.encrypted)).toHaveLength(1)
  })

  it('take commits in order: one per epoch, the rest are stale', async () => {
    const aliceDevice = await register(alice)
    const bobDevice = await register(bob)
    await upload(bob, bobDevice.id, [b64()])
    const channel = await openEncrypted(alice, [bob.id])
    const [claimed] = (await call(alice, 'POST', `/users/${bob.id}/key-packages/claim`)).json().data
      .keyPackages
    const bobSocket = (await identify(app, bob.cookie)).socket
    sockets.push(bobSocket)

    const first = await call(alice, 'POST', `/channels/${channel.id}/e2ee/commits`, {
      deviceId: aliceDevice.id,
      epoch: 0,
      commit: b64(),
      welcome: b64(),
      welcomeTargets: [{ deviceId: bobDevice.id, keyPackageId: claimed.keyPackageId }],
    })
    expect(first.statusCode).toBe(204)
    expect(await bobSocket.dispatch('E2EE_HANDSHAKE')).toMatchObject({
      channelId: channel.id,
      kind: 'commit',
      epoch: 0,
    })

    const stale = await call(bob, 'POST', `/channels/${channel.id}/e2ee/commits`, {
      deviceId: bobDevice.id,
      epoch: 0,
      commit: b64(),
    })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().code).toBe('STALE_EPOCH')
    expect(
      (
        await call(bob, 'POST', `/channels/${channel.id}/e2ee/commits`, {
          deviceId: bobDevice.id,
          epoch: 1,
          commit: b64(),
        })
      ).statusCode,
    ).toBe(204)
  })

  it('give each device the commits and only its own Welcomes', async () => {
    const aliceDevice = await register(alice)
    const bobDevice = await register(bob)
    const bobOther = await register(bob, 'Телефон')
    const channel = await openEncrypted(alice, [bob.id])
    await call(alice, 'POST', `/channels/${channel.id}/e2ee/commits`, {
      deviceId: aliceDevice.id,
      epoch: 0,
      commit: b64(),
      welcome: b64(),
      welcomeTargets: [{ deviceId: bobDevice.id, keyPackageId: '1' }],
    })

    const list = async (actor: TestActor, deviceId: string) =>
      (
        await call(actor, 'GET', `/channels/${channel.id}/e2ee/handshakes?deviceId=${deviceId}`)
      ).json().data.handshakes as { kind: string; targetDeviceId: string | null }[]

    expect((await list(bob, bobDevice.id)).map((h) => h.kind)).toEqual(['commit', 'welcome'])
    expect((await list(bob, bobOther.id)).map((h) => h.kind)).toEqual(['commit'])
    expect(
      (await call(bob, 'GET', `/channels/${channel.id}/e2ee/handshakes?deviceId=${aliceDevice.id}`))
        .statusCode,
    ).toBe(404)
  })

  it('refuse Welcomes for devices outside the conversation and commits from strangers', async () => {
    const aliceDevice = await register(alice)
    const strangerDevice = await register(outsider)
    const channel = await openEncrypted(alice, [bob.id])

    const foreign = await call(alice, 'POST', `/channels/${channel.id}/e2ee/commits`, {
      deviceId: aliceDevice.id,
      epoch: 0,
      commit: b64(),
      welcome: b64(),
      welcomeTargets: [{ deviceId: strangerDevice.id, keyPackageId: '1' }],
    })
    expect(foreign.json().code).toBe('UNKNOWN_DEVICE')
    const stranger = await call(outsider, 'POST', `/channels/${channel.id}/e2ee/commits`, {
      deviceId: strangerDevice.id,
      epoch: 0,
      commit: b64(),
    })
    expect(stranger.statusCode).toBe(404)
  })

  it('carry ciphertext, never plain content', async () => {
    const channel = await openEncrypted(alice, [bob.id])
    const ciphertext = b64(200)

    const sent = await call(alice, 'POST', `/channels/${channel.id}/messages`, { ciphertext })
    expect(sent.statusCode).toBe(201)
    expect(sent.json().data.message).toMatchObject({ content: '', ciphertext })
    const plain = await call(alice, 'POST', `/channels/${channel.id}/messages`, {
      content: 'открыто',
    })
    expect(plain.json().code).toBe('ENCRYPTED_CHANNEL')

    const history = (await call(bob, 'GET', `/channels/${channel.id}/messages`)).json().data
      .messages
    expect(history[0]).toMatchObject({ ciphertext })
    const edited = await call(
      alice,
      'PATCH',
      `/channels/${channel.id}/messages/${sent.json().data.message.id}`,
      {
        ciphertext: b64(100),
      },
    )
    expect(edited.statusCode).toBe(200)

    const normal = (
      await call(alice, 'POST', '/users/@me/channels', { recipientIds: [bob.id] })
    ).json().data.channel
    const wrong = await call(alice, 'POST', `/channels/${normal.id}/messages`, { ciphertext })
    expect(wrong.json().code).toBe('NOT_ENCRYPTED')
  })

  it('take edits and replies as ciphertext, with nothing to quote', async () => {
    const channel = await openEncrypted(alice, [bob.id])
    const path = `/channels/${channel.id}/messages`
    const original = (await call(alice, 'POST', path, { ciphertext: b64(80) })).json().data.message

    const plainEdit = await call(alice, 'PATCH', `${path}/${original.id}`, { content: 'открыто' })
    expect(plainEdit.json().code).toBe('ENCRYPTED_CHANNEL')
    const edited = await call(alice, 'PATCH', `${path}/${original.id}`, { ciphertext: b64(90) })
    expect(edited.json().data.message.editedAt).toEqual(expect.any(String))

    const reply = await call(bob, 'POST', path, { ciphertext: b64(60), replyTo: original.id })
    expect(reply.json().data.message.reply).toMatchObject({
      messageId: original.id,
      message: { content: '' },
    })
  })
})
