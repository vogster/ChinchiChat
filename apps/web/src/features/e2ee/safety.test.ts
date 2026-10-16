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
  /** Another device of the user, approved with the recovery key (so signed by the user key). */
  const approved = async (first: ReturnType<typeof client>, userId: string, name: string) => {
    const device = client(userId, name)
    expect(await device.recovery.useKey((await first.recovery.key()) as string)).toBe('ok')
    return device
  }
  return { delivery, client, approved }
}

describe('checking who is on the other end', () => {
  it('shows both people the same code, kept when they approve a new device themselves', async () => {
    const { client, approved } = setup()
    const alice = client(ALICE)
    const bob = client(BOB)
    await Promise.all([alice.ready(), bob.ready()])

    const code = await alice.safety.codeWith(BOB)
    expect(code).toMatch(/^\d{60}$/)
    expect(await bob.safety.codeWith(ALICE)).toBe(code)

    await approved(bob, BOB, 'Телефон')
    await alice.devicesChanged(BOB)
    expect(await alice.safety.codeWith(BOB)).toBe(code)
  })

  it('stay verified through approved devices; warn only about an unapproved one', async () => {
    const { client, approved } = setup()
    const alice = client(ALICE)
    const bob = client(BOB)
    await Promise.all([alice.ready(), bob.ready()])
    await alice.safety.status([ALICE, BOB])
    await alice.safety.verify(BOB)

    await approved(bob, BOB, 'Телефон')
    await alice.devicesChanged(BOB)
    expect((await alice.safety.status([ALICE, BOB])).people).toEqual([
      { userId: BOB, verified: true, newDevices: [], keyChanged: false },
    ])

    // A device nobody approved: the server could have slipped it in.
    await client(BOB, 'Неизвестный').ready()
    await alice.devicesChanged(BOB)
    const [person] = (await alice.safety.status([ALICE, BOB])).people
    expect(person?.newDevices.map((d) => d.name)).toEqual(['Неизвестный'])
    expect(person?.verified).toBe(true)
    await alice.safety.acknowledge(BOB)
    expect((await alice.safety.status([ALICE, BOB])).people[0]?.newDevices).toEqual([])
  })

  it('see a reset of keys: a new code, no longer verified, and a warning', async () => {
    const { client } = setup()
    const alice = client(ALICE)
    const bob = client(BOB)
    await Promise.all([alice.ready(), bob.ready()])
    await alice.safety.status([ALICE, BOB])
    await alice.safety.verify(BOB)
    const before = await alice.safety.codeWith(BOB)
    const oldKey = await bob.recovery.key()

    // Bob lost everything, key included, and starts over on a new browser.
    const fresh = client(BOB, 'Новый браузер')
    await fresh.recovery.reset()
    await alice.devicesChanged(BOB)

    expect(await fresh.recovery.key()).not.toBe(oldKey)
    expect(await alice.safety.codeWith(BOB)).not.toBe(before)
    expect((await alice.safety.status([ALICE, BOB])).people[0]).toMatchObject({
      verified: false,
      keyChanged: true,
    })
    await alice.safety.acknowledge(BOB)
    expect((await alice.safety.status([ALICE, BOB])).people[0]?.keyChanged).toBe(false)
  })

  it('warn about an unapproved device on my own account (not this one)', async () => {
    const { client, approved } = setup()
    const alice = client(ALICE)
    await alice.ready()
    expect((await alice.safety.status([ALICE])).mine).toEqual([])

    await approved(alice, ALICE, 'Мой телефон')
    await client(ALICE, 'Чужой ноутбук').ready()
    await alice.devicesChanged(ALICE)

    expect((await alice.safety.status([ALICE])).mine.map((d) => d.name)).toEqual(['Чужой ноутбук'])
    await alice.safety.acknowledge(ALICE)
    expect((await alice.safety.status([ALICE])).mine).toEqual([])
  })
})
