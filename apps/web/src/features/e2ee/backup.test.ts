import { describe, expect, it } from 'vitest'

import { createE2eeClient } from './client'
import { createFakeDelivery } from './fake-delivery'
import { createMemoryStore } from './store'

const ALICE = '1'
const BOB = '2'
const DM = { id: '500', memberIds: [ALICE, BOB] }

const setup = () => {
  const delivery = createFakeDelivery()
  const client = (userId: string, name = 'Браузер', store = createMemoryStore()) =>
    createE2eeClient({ api: delivery.apiFor(userId), store, userId, deviceName: name })
  return { delivery, client }
}

describe('history backup', () => {
  it('starts with the first device: a recovery key to save, shown again on request', async () => {
    const { delivery, client } = setup()
    const alice = client(ALICE)
    await alice.ready()

    const key = await alice.recovery.key()
    expect(key).toMatch(/^([0-9A-Z]{4}-){12}[0-9A-Z]{4}$/)
    expect(delivery.backups.get(ALICE)).toBeDefined()
    expect(await alice.recovery.saved()).toBe(false)
    await alice.recovery.markSaved()
    expect(await alice.recovery.saved()).toBe(true)
    expect(await alice.recovery.key()).toBe(key)
  })

  it('gives a new device the history it was not there for, with the recovery key', async () => {
    const { client } = setup()
    const laptop = client(ALICE, 'Ноутбук')
    const bob = client(BOB)
    await bob.ready()
    await laptop.open(DM)
    const mine = await laptop.send(DM, 'Пароль от вайфая — котики')
    const theirs = await bob.send(DM, 'Записал')
    expect(await laptop.read(DM, theirs)).toMatchObject({ text: 'Записал' })
    const key = (await laptop.recovery.key()) as string
    await laptop.flushBackup()

    // All of Alice's devices are lost; a new browser comes in with the recovery key.
    const fresh = client(ALICE, 'Новый браузер')
    expect(await fresh.recovery.useKey(key)).toBe('ok')

    expect(await fresh.read(DM, mine)).toMatchObject({ text: 'Пароль от вайфая — котики' })
    expect(await fresh.read(DM, theirs)).toMatchObject({ text: 'Записал' })
    expect(await fresh.recovery.saved()).toBe(true)
  })

  it('brings back reactions to old messages along with them', async () => {
    const { client, delivery } = setup()
    const laptop = client(ALICE, 'Ноутбук')
    const bob = client(BOB)
    await bob.ready()
    await laptop.open(DM)
    const message = await laptop.send(DM, 'Кто за пиццу?')
    await bob.react(DM, message.id, ['🍕', '👍'])
    const reaction = {
      userId: BOB,
      version: '77',
      ciphertext: delivery.encryptedReactions.get(`${message.id}:${BOB}`) as string,
    }
    expect(await laptop.readReaction(DM, message.id, reaction)).toEqual(['🍕', '👍'])
    const key = (await laptop.recovery.key()) as string
    await laptop.flushBackup()

    const fresh = client(ALICE, 'Новый браузер')
    expect(await fresh.recovery.useKey(key)).toBe('ok')

    expect(await fresh.readReaction(DM, message.id, reaction)).toEqual(['🍕', '👍'])
  })

  it('says whether a typed key is malformed or simply not this account’s', async () => {
    const { client } = setup()
    await client(ALICE, 'Ноутбук').ready()
    const other = setup()
    const stranger = other.client(ALICE)
    await stranger.ready()
    const wrongKey = (await stranger.recovery.key()) as string

    const fresh = client(ALICE, 'Новый браузер')
    expect(await fresh.recovery.useKey('ABCD-1234')).toBe('invalid')
    expect(await fresh.recovery.useKey(wrongKey)).toBe('wrong')
  })
})
