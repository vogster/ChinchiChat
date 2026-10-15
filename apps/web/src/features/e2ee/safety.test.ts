import { describe, expect, it } from 'vitest'

import { createE2eeClient } from './client'
import { createFakeDelivery } from './fake-delivery'
import { createMemoryStore } from './store'

const ALICE = '1'
const BOB = '2'

const setup = () => {
  const delivery = createFakeDelivery()
  const client = (userId: string, name = 'Браузер') =>
    createE2eeClient({
      api: delivery.apiFor(userId),
      store: createMemoryStore(),
      userId,
      deviceName: name,
    })
  return { delivery, client }
}

describe('safety codes', () => {
  it('are the same on both sides and change with the devices', async () => {
    const { client } = setup()
    const alice = client(ALICE)
    const bob = client(BOB)
    await Promise.all([alice.ready(), bob.ready()])

    const code = await alice.safety.codeWith(BOB)
    expect(code).toMatch(/^\d{60}$/)
    expect(await bob.safety.codeWith(ALICE)).toBe(code)

    await client(BOB, 'Телефон').ready()
    await alice.devicesChanged(BOB)
    expect(await alice.safety.codeWith(BOB)).not.toBe(code)
  })

  it('stay verified until the person gets another device', async () => {
    const { client } = setup()
    const alice = client(ALICE)
    await Promise.all([alice.ready(), client(BOB).ready()])

    expect((await alice.safety.status([ALICE, BOB])).people).toEqual([
      { userId: BOB, verified: false, newDevices: [] },
    ])
    await alice.safety.verify(BOB)
    expect((await alice.safety.status([ALICE, BOB])).people[0]?.verified).toBe(true)

    await client(BOB, 'Телефон').ready()
    await alice.devicesChanged(BOB)
    const [bob] = (await alice.safety.status([ALICE, BOB])).people
    expect(bob?.verified).toBe(false)
    expect(bob?.newDevices.map((d) => d.name)).toEqual(['Телефон'])
  })

  it('warn about a new device once, until acknowledged', async () => {
    const { client } = setup()
    const alice = client(ALICE)
    await Promise.all([alice.ready(), client(BOB).ready()])
    // Seen first: trusted as it is.
    await alice.safety.status([ALICE, BOB])

    await client(BOB, 'Телефон').ready()
    await alice.devicesChanged(BOB)
    expect((await alice.safety.status([ALICE, BOB])).people[0]?.newDevices).toHaveLength(1)

    await alice.safety.acknowledge(BOB)
    expect((await alice.safety.status([ALICE, BOB])).people[0]?.newDevices).toEqual([])
  })

  it('warn about a new device of my own (not this one)', async () => {
    const { client } = setup()
    const alice = client(ALICE)
    await alice.ready()
    expect((await alice.safety.status([ALICE])).mine).toEqual([])

    await client(ALICE, 'Чужой ноутбук').ready()
    await alice.devicesChanged(ALICE)

    expect((await alice.safety.status([ALICE])).mine.map((d) => d.name)).toEqual(['Чужой ноутбук'])
    await alice.safety.acknowledge(ALICE)
    expect((await alice.safety.status([ALICE])).mine).toEqual([])
  })
})
