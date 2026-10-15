import { describe, expect, it } from 'vitest'

import { createE2eeClient } from './client'
import { createFakeDelivery } from './fake-delivery'
import { createMemoryStore } from './store'

import type { E2eeClient } from './client'

const ALICE = '1'
const BOB = '2'
const DM = { id: '500', memberIds: [ALICE, BOB] }

const setup = () => {
  const delivery = createFakeDelivery()
  const client = (userId: string, name = 'Браузер', store = createMemoryStore()) => {
    const c = createE2eeClient({ api: delivery.apiFor(userId), store, userId, deviceName: name })
    return { client: c, store }
  }
  return { delivery, client }
}

/** Sends from one client and returns what the other reads of it. */
const relay = async (from: E2eeClient, to: E2eeClient, text: string) => {
  const sent = await from.send(DM, text)
  return to.read(DM, sent)
}

describe('e2ee client', () => {
  it('sets up a conversation the other side joins, and both read each other', async () => {
    const { client } = setup()
    const alice = client(ALICE).client
    const bob = client(BOB).client
    await bob.ready()
    await alice.open(DM)

    expect(await relay(alice, bob, 'Привет, Боб')).toEqual({ v: 1, text: 'Привет, Боб' })
    expect(await relay(bob, alice, 'Привет, Алиса')).toEqual({ v: 1, text: 'Привет, Алиса' })
  })

  it('remembers what it decrypted and what it sent (MLS opens a message only once)', async () => {
    const { client } = setup()
    const alice = client(ALICE).client
    const bobSide = client(BOB)
    await bobSide.client.ready()
    await alice.open(DM)
    const sent = await alice.send(DM, 'Один раз')

    expect(await bobSide.client.read(DM, sent)).toMatchObject({ text: 'Один раз' })
    expect(await bobSide.client.read(DM, sent)).toMatchObject({ text: 'Один раз' })
    expect(await alice.read(DM, sent)).toMatchObject({ text: 'Один раз' })

    // After a reload (same store, new client) both still read it.
    const reloaded = createE2eeClient({
      api: setup().delivery.apiFor(BOB),
      store: bobSide.store,
      userId: BOB,
      deviceName: 'Браузер',
    })
    expect(await reloaded.read(DM, sent)).toMatchObject({ text: 'Один раз' })
  })

  it('brings in a new device of a member, which reads from then on', async () => {
    const { client } = setup()
    const alice = client(ALICE).client
    const bob = client(BOB).client
    await bob.ready()
    await alice.open(DM)
    const before = await alice.send(DM, 'До нового устройства')

    const bobPhone = client(BOB, 'Телефон').client
    await bobPhone.ready()
    // Any member notices the new device when it next opens the conversation.
    await bob.open(DM)
    await bobPhone.open(DM)

    expect(await bobPhone.read(DM, before)).toBeNull()
    expect(await relay(alice, bobPhone, 'Уже с телефоном')).toMatchObject({
      text: 'Уже с телефоном',
    })
    expect(await bob.read(DM, await alice.send(DM, 'И на ноутбук'))).toMatchObject({
      text: 'И на ноутбук',
    })
  })

  it('drops a removed device from the conversation', async () => {
    const { client, delivery } = setup()
    const alice = client(ALICE).client
    const bob = client(BOB).client
    const bobOld = client(BOB, 'Старый').client
    await bob.ready()
    const oldId = await bobOld.ready()
    await alice.open(DM)
    await bobOld.open(DM)

    await delivery.apiFor(BOB).e2ee.deleteDevice(oldId)
    await alice.devicesChanged(BOB)
    await alice.open(DM)

    const secret = await alice.send(DM, 'Не для старого')
    expect(await bob.read(DM, secret)).toMatchObject({ text: 'Не для старого' })
    expect(await bobOld.read(DM, secret)).toBeNull()
  })

  it('sends the secrets of files inside the message and their attachments alongside', async () => {
    const { client, delivery } = setup()
    const alice = client(ALICE).client
    const bob = client(BOB).client
    await bob.ready()
    await alice.open(DM)
    const file = {
      id: '900',
      name: 'план.pdf',
      type: 'application/pdf',
      size: 10,
      key: 'a2V5',
      iv: 'aXY=',
    }

    const sent = await alice.send(DM, 'Вот план', undefined, [file])

    expect(delivery.messages.at(-1)?.attachmentIds).toEqual(['900'])
    expect(await bob.read(DM, sent)).toEqual({ v: 1, text: 'Вот план', files: [file] })
    expect(await alice.read(DM, sent)).toMatchObject({ files: [file] })
  })

  it('gives every member the same call key, which changes with the conversation', async () => {
    const { client } = setup()
    const alice = client(ALICE).client
    const bob = client(BOB).client
    await bob.ready()
    await alice.open(DM)
    await bob.open(DM)

    const first = await alice.callKey(DM)
    expect(first?.key).toHaveLength(32)
    expect(await bob.callKey(DM)).toEqual(first)

    // A new device joins: a new epoch and a new key, which the old one can't follow.
    const bobPhone = client(BOB, 'Телефон').client
    await bobPhone.ready()
    await alice.open(DM)
    const second = await bob.callKey(DM)
    expect(second?.epoch).toBeGreaterThan(first?.epoch ?? 0)
    expect(second?.key).not.toEqual(first?.key)
    expect(await alice.callKey(DM)).toEqual(second)
    expect(await bobPhone.callKey(DM)).toEqual(second)
  })

  it('has no call key on a device that is still waiting to be let in', async () => {
    const { client } = setup()
    const bob = client(BOB).client
    await bob.ready()
    await bob.open(DM)
    const alice = client(ALICE).client

    expect(await alice.callKey(DM)).toBeNull()
  })

  it('settles who starts the conversation when both open it at once', async () => {
    const { client } = setup()
    const alice = client(ALICE).client
    const bob = client(BOB).client
    await Promise.all([alice.ready(), bob.ready()])

    await Promise.all([alice.open(DM), bob.open(DM)])

    expect(await relay(alice, bob, 'Кто первый')).toMatchObject({ text: 'Кто первый' })
    expect(await relay(bob, alice, 'Тот и создал')).toMatchObject({ text: 'Тот и создал' })
  })

  it('says a conversation is waiting until another device lets this one in', async () => {
    const { client } = setup()
    const alice = client(ALICE).client
    const bob = client(BOB).client
    await bob.ready()

    // Bob opens first: no group yet and nobody to start it but him... he starts it.
    expect(await bob.open(DM)).toBe('ready')
    // Alice has no device yet: she registers and waits for a member to add her.
    expect(await alice.open(DM)).toBe('waiting')
    await bob.open(DM)
    expect(await alice.open(DM)).toBe('ready')
  })

  it('registers one device even when two clients of a browser start at once', async () => {
    const { client, delivery } = setup()
    const store = createMemoryStore()
    const first = client(BOB, 'Браузер', store).client
    const second = client(BOB, 'Браузер', store).client

    const [a, b] = await Promise.all([first.ready(), second.ready()])

    expect(a).toBe(b)
    expect(delivery.devices.filter((d) => d.userId === BOB)).toHaveLength(1)
  })

  it('keeps one device when the page reloads while the server registers it', async () => {
    const { delivery } = setup()
    const store = createMemoryStore()
    const api = delivery.apiFor(BOB)
    // The server stores the device, but the page is gone before it hears back.
    const interrupted = createE2eeClient({
      api: {
        ...api,
        e2ee: {
          ...api.e2ee,
          registerDevice: async (body) => {
            await api.e2ee.registerDevice(body)
            throw new Error('page unloaded')
          },
        },
      },
      store,
      userId: BOB,
      deviceName: 'Браузер',
    })
    await expect(interrupted.ready()).rejects.toHaveProperty('message', 'page unloaded')

    const reloaded = createE2eeClient({ api, store, userId: BOB, deviceName: 'Браузер' })
    const deviceId = await reloaded.ready()

    const bobs = delivery.devices.filter((d) => d.userId === BOB)
    expect(bobs).toHaveLength(1)
    expect(deviceId).toBe(bobs[0]?.id)
  })
})
