import { describe, expect, it } from 'vitest'

import { createE2eeClient } from './client'
import { createFakeDelivery } from './fake-delivery'
import { createMemoryStore } from './store'

const ALICE = '1'
const BOB = '2'

const setup = () => {
  const delivery = createFakeDelivery()
  const client = (userId: string, name = 'Браузер', store = createMemoryStore()) =>
    createE2eeClient({
      api: delivery.apiFor(userId),
      store,
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

const pendingNames = async (alice: ReturnType<ReturnType<typeof setup>['client']>) =>
  (await alice.safety.status([ALICE, BOB])).people[0]?.newDevices.map((d) => d.name)

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

  it('let in on their own the devices a person approved; an unapproved one waits for consent', async () => {
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

    // A device nobody approved: the server could have slipped it in. It waits for Alice.
    await client(BOB, 'Неизвестный').ready()
    await alice.devicesChanged(BOB)
    const [person] = (await alice.safety.status([ALICE, BOB])).people
    expect(person?.newDevices.map((d) => d.name)).toEqual(['Неизвестный'])
    expect(person?.verified).toBe(true)
    const stranger = person?.newDevices[0]?.id as string
    expect(await alice.safety.allowedDevices(BOB)).not.toContain(stranger)

    await alice.safety.acceptDevice(BOB, stranger)
    expect(await pendingNames(alice)).toEqual([])
    expect(await alice.safety.allowedDevices(BOB)).toContain(stranger)
  })

  it('even at first sight: only the devices the person approved are let in without asking', async () => {
    const { client } = setup()
    const bob = client(BOB)
    await bob.ready()
    await client(BOB, 'Неизвестный').ready()
    const alice = client(ALICE)
    await alice.ready()

    expect(await pendingNames(alice)).toEqual(['Неизвестный'])
  })

  it('give each device a code both sides read the same, 20 digits', async () => {
    const { client } = setup()
    const alice = client(ALICE)
    const bob = client(BOB)
    await Promise.all([alice.ready(), bob.ready()])
    const phone = client(BOB, 'Телефон')
    await phone.ready()
    await alice.devicesChanged(BOB)

    const [listed] = (await alice.safety.status([ALICE, BOB])).people[0]?.newDevices ?? []
    const seenByAlice = await alice.safety.deviceCode(listed?.signaturePublicKey as string)
    expect(seenByAlice).toMatch(/^\d{20}$/)
    expect(await phone.safety.thisDeviceCode()).toBe(seenByAlice)
    expect(await bob.safety.thisDeviceCode()).not.toBe(seenByAlice)
  })

  it('see a reset of keys: a new code, no longer verified, its devices wait for consent', async () => {
    const { client } = setup()
    const alice = client(ALICE)
    const bob = client(BOB)
    await Promise.all([alice.ready(), bob.ready()])
    await alice.safety.status([ALICE, BOB])
    await alice.safety.verify(BOB)
    const before = await alice.safety.codeWith(BOB)
    const oldKey = await bob.recovery.key()

    // Bob lost everything, key included, and starts over on a new browser — or someone posing
    // as him did: the new key signs the new browser, but Alice never saw that key.
    const fresh = client(BOB, 'Новый браузер')
    await fresh.recovery.reset({ password: 'password123' })
    await alice.devicesChanged(BOB)

    expect(await fresh.recovery.key()).not.toBe(oldKey)
    expect(await alice.safety.codeWith(BOB)).not.toBe(before)
    expect((await alice.safety.status([ALICE, BOB])).people[0]).toMatchObject({
      verified: false,
      keyChanged: true,
    })
    // A reset drops every signature: the old browser and the new one both wait.
    expect(await pendingNames(alice)).toEqual(['Браузер', 'Новый браузер'])

    // Alice accepts the new key: the device it signs passes, the old unsigned one still waits.
    await alice.safety.acceptKey(BOB)
    expect((await alice.safety.status([ALICE, BOB])).people[0]?.keyChanged).toBe(false)
    expect(await pendingNames(alice)).toEqual(['Браузер'])
  })

  it('keep the devices accepted with "got it" before consent was required', async () => {
    const { client } = setup()
    const bob = client(BOB)
    await bob.ready()
    const phone = client(BOB, 'Телефон')
    await phone.ready()
    const store = createMemoryStore()
    // What an earlier version left: the user key seen, the phone acknowledged by id.
    const alice = client(ALICE, 'Браузер', store)
    await alice.ready()
    const [listed] = (await alice.safety.status([ALICE, BOB])).people[0]?.newDevices ?? []
    await store.set(`safety:seen:${BOB}`, [listed?.id])
    await store.delete(`safety:accepted:${BOB}`)

    expect(await pendingNames(alice)).toEqual([])
    expect(await alice.safety.allowedDevices(BOB)).toContain(listed?.id)
  })

  it('warn about an unapproved device on my own account (not this one), and never let it in', async () => {
    const { client, approved } = setup()
    const alice = client(ALICE)
    await alice.ready()
    expect((await alice.safety.status([ALICE])).mine).toEqual([])

    await approved(alice, ALICE, 'Мой телефон')
    await client(ALICE, 'Чужой ноутбук').ready()
    await alice.devicesChanged(ALICE)

    const mine = (await alice.safety.status([ALICE])).mine
    expect(mine.map((d) => d.name)).toEqual(['Чужой ноутбук'])
    expect(await alice.safety.allowedDevices(ALICE)).not.toContain(mine[0]?.id)
    await alice.safety.acknowledge(ALICE)
    expect((await alice.safety.status([ALICE])).mine).toEqual([])
    expect(await alice.safety.allowedDevices(ALICE)).not.toContain(mine[0]?.id)
  })
})
