import { deviceStatement } from '@chinchi/shared'
import { verifyStatement } from '@chinchi/e2ee'
import { describe, expect, it } from 'vitest'

import { fromBase64 } from './codec'
import { createE2eeClient } from './client'
import { createFakeDelivery } from './fake-delivery'
import { createMemoryStore } from './store'

const ALICE = '1'

const setup = () => {
  const delivery = createFakeDelivery()
  const client = (name = 'Браузер', store = createMemoryStore()) =>
    createE2eeClient({ api: delivery.apiFor(ALICE), store, userId: ALICE, deviceName: name })
  return { delivery, client }
}

describe('cross-signing', () => {
  it('the first device creates the user key and vouches for itself', async () => {
    const { delivery, client } = setup()

    const deviceId = await client().ready()

    const userKey = delivery.userKeys.get(ALICE)
    const device = delivery.devices.find((d) => d.id === deviceId)
    expect(userKey).toBeDefined()
    expect(device?.userSignature).toEqual(expect.any(String))
    expect(
      await verifyStatement(
        fromBase64(userKey as string),
        deviceStatement(ALICE, deviceId, device?.signaturePublicKey as string),
        fromBase64(device?.userSignature as string),
      ),
    ).toBe(true)
  })

  it('a later device without the key waits to be approved, unsigned', async () => {
    const { delivery, client } = setup()
    await client('Ноутбук').ready()
    const key = delivery.userKeys.get(ALICE)

    const phoneId = await client('Телефон').ready()

    expect(delivery.userKeys.get(ALICE)).toBe(key)
    expect(delivery.devices.find((d) => d.id === phoneId)?.userSignature).toBeNull()
  })

  it('two first devices at once end up with one user key', async () => {
    const { delivery, client } = setup()

    const [a, b] = await Promise.all([client('A').ready(), client('B').ready()])

    expect(delivery.userKeys.size).toBe(1)
    const signed = delivery.devices.filter((d) => [a, b].includes(d.id) && d.userSignature)
    expect(signed).toHaveLength(1)
  })

  it('a reloaded device keeps its key and signature', async () => {
    const { delivery, client } = setup()
    const store = createMemoryStore()
    const id = await client('Браузер', store).ready()
    const signature = delivery.devices.find((d) => d.id === id)?.userSignature

    expect(await client('Браузер', store).ready()).toBe(id)
    expect(delivery.devices.find((d) => d.id === id)?.userSignature).toBe(signature)
  })
})
