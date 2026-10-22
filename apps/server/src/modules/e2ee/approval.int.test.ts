import { createHash, randomBytes } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { identify } from '../../../test/gateway-client'
import { signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

import type { TestSocket } from '../../../test/gateway-client'
import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, close } = createTestApp()
const sockets: TestSocket[] = []

let alice: TestActor
let bob: TestActor

const b64 = (bytes = 32) => randomBytes(bytes).toString('base64')
const commit = (publicKey: string) =>
  createHash('sha256').update(Buffer.from(publicKey, 'base64')).digest('base64')
const call = (actor: TestActor, method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: actor.headers,
    ...(payload ? { payload } : {}),
  })

const device = async (actor: TestActor) =>
  (
    await call(actor, 'POST', '/users/@me/devices', { name: 'Браузер', signaturePublicKey: b64() })
  ).json().data.device as { id: string }

/** Marks a device as vouched for, as if signed by the user key (straight in the database). */
const vouch = async (deviceId: string) => {
  await db.execute(sql`update e2ee_devices set user_signature = ${b64(64)} where id = ${deviceId}`)
}

beforeAll(async () => {
  await app.listen({ host: '127.0.0.1', port: 0 })
})

beforeEach(async () => {
  await resetState(db, redis)
  alice = await signUp(app, { username: 'alice', email: 'alice@example.com' })
  bob = await signUp(app, { username: 'bob', email: 'bob@example.com' })
})

afterAll(async () => {
  for (const socket of sockets) socket.close()
  await close()
})

describe('approving a new device', () => {
  it('goes request → accept → reveal → complete, announced to all my sessions', async () => {
    const laptop = await device(alice)
    await vouch(laptop.id)
    const phone = await device(alice)
    const watcher = (await identify(app, alice.cookie)).socket
    sockets.push(watcher)
    const phoneKey = b64()

    const requested = (
      await call(alice, 'POST', '/users/@me/e2ee/approvals', {
        deviceId: phone.id,
        commitment: commit(phoneKey),
      })
    ).json().data.approval
    expect(requested).toMatchObject({ state: 'requested', newDeviceId: phone.id, newKey: null })
    expect(await watcher.dispatch('E2EE_APPROVAL_UPDATE')).toMatchObject({ id: requested.id })
    const path = `/users/@me/e2ee/approvals/${requested.id}`

    const laptopKey = b64()
    const accepted = await call(alice, 'POST', `${path}/accept`, {
      deviceId: laptop.id,
      publicKey: laptopKey,
    })
    expect(accepted.json().data.approval).toMatchObject({
      state: 'accepted',
      approverDeviceId: laptop.id,
      approverKey: laptopKey,
    })

    const wrongReveal = await call(alice, 'POST', `${path}/reveal`, { publicKey: b64() })
    expect(wrongReveal.json().code).toBe('COMMITMENT_MISMATCH')
    const revealed = await call(alice, 'POST', `${path}/reveal`, { publicKey: phoneKey })
    expect(revealed.json().data.approval).toMatchObject({ state: 'revealed', newKey: phoneKey })

    const secrets = b64(200)
    const completed = await call(alice, 'POST', `${path}/complete`, { secrets })
    expect(completed.json().data.approval).toMatchObject({ state: 'completed', secrets })
    expect((await call(alice, 'GET', path)).json().data.approval.state).toBe('completed')
  })

  it('lets only one of two approved devices answering at once take the approval', async () => {
    const laptop = await device(alice)
    const tablet = await device(alice)
    await vouch(laptop.id)
    await vouch(tablet.id)
    const phone = await device(alice)

    // Several rounds: the two requests have to land together for the race to show.
    for (let round = 0; round < 5; round += 1) {
      const { id } = (
        await call(alice, 'POST', '/users/@me/e2ee/approvals', {
          deviceId: phone.id,
          commitment: commit(b64()),
        })
      ).json().data.approval
      const answers = await Promise.all(
        [laptop, tablet].map((approver) =>
          call(alice, 'POST', `/users/@me/e2ee/approvals/${id}/accept`, {
            deviceId: approver.id,
            publicKey: b64(),
          }),
        ),
      )

      expect(answers.map((a) => a.statusCode).sort()).toEqual([200, 409])
      const winner = answers.find((a) => a.statusCode === 200)?.json().data.approval
      const stored = (await call(alice, 'GET', `/users/@me/e2ee/approvals/${id}`)).json().data
        .approval
      expect(stored).toMatchObject({
        approverDeviceId: winner.approverDeviceId,
        approverKey: winner.approverKey,
      })
    }
  })

  it('only for an unsigned device of mine, approved by a signed one, in order', async () => {
    const laptop = await device(alice)
    const phone = await device(alice)
    const commitment = commit(b64())

    // Nobody can approve yet: the laptop isn't vouched for either.
    const { id } = (
      await call(alice, 'POST', '/users/@me/e2ee/approvals', { deviceId: phone.id, commitment })
    ).json().data.approval
    const byUnsigned = await call(alice, 'POST', `/users/@me/e2ee/approvals/${id}/accept`, {
      deviceId: laptop.id,
      publicKey: b64(),
    })
    expect(byUnsigned.json().code).toBe('DEVICE_NOT_APPROVED')

    await vouch(laptop.id)
    const forSigned = await call(alice, 'POST', '/users/@me/e2ee/approvals', {
      deviceId: laptop.id,
      commitment,
    })
    expect(forSigned.json().code).toBe('DEVICE_ALREADY_APPROVED')
    const early = await call(alice, 'POST', `/users/@me/e2ee/approvals/${id}/complete`, {
      secrets: b64(),
    })
    expect(early.json().code).toBe('APPROVAL_STATE')

    // Someone else's approval is not there at all.
    expect((await call(bob, 'GET', `/users/@me/e2ee/approvals/${id}`)).statusCode).toBe(404)
    const bobsDevice = await device(bob)
    const foreign = await call(alice, 'POST', '/users/@me/e2ee/approvals', {
      deviceId: bobsDevice.id,
      commitment,
    })
    expect(foreign.statusCode).toBe(404)
  })

  it('can be declined from either side', async () => {
    const phone = await device(alice)
    const { id } = (
      await call(alice, 'POST', '/users/@me/e2ee/approvals', {
        deviceId: phone.id,
        commitment: commit(b64()),
      })
    ).json().data.approval

    expect((await call(alice, 'DELETE', `/users/@me/e2ee/approvals/${id}`)).statusCode).toBe(204)
    expect(
      (await call(alice, 'GET', `/users/@me/e2ee/approvals/${id}`)).json().data.approval.state,
    ).toBe('declined')
  })
})
