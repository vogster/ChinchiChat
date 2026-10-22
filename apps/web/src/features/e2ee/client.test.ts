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

/** Sends from one client and returns what the other reads of it (the payload, when readable). */
const relay = async (from: E2eeClient, to: E2eeClient, text: string) => {
  const sent = await from.send(DM, text)
  return (await to.read(DM, sent))?.payload ?? null
}

/** The person here lets in every device of someone that waits (having compared its code). */
const letIn = async (who: E2eeClient, ownerId: string) => {
  await who.devicesChanged(ownerId)
  const [person] = (await who.safety.status([ownerId])).people
  for (const device of person?.newDevices ?? []) await who.safety.acceptDevice(ownerId, device.id)
}

/** Commits posted so far, in every conversation. */
const commitCount = (delivery: ReturnType<typeof createFakeDelivery>) =>
  delivery.handshakes.filter((h) => h.kind === 'commit').length

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

    expect(await bobSide.client.read(DM, sent)).toMatchObject({ payload: { text: 'Один раз' } })
    expect(await bobSide.client.read(DM, sent)).toMatchObject({ payload: { text: 'Один раз' } })
    expect(await alice.read(DM, sent)).toMatchObject({ payload: { text: 'Один раз' } })

    // After a reload (same store, new client) both still read it.
    const reloaded = createE2eeClient({
      api: setup().delivery.apiFor(BOB),
      store: bobSide.store,
      userId: BOB,
      deviceName: 'Браузер',
    })
    expect(await reloaded.read(DM, sent)).toMatchObject({ payload: { text: 'Один раз' } })
  })

  it('vouches for the author when the signer MLS verified is who the server says', async () => {
    const { client } = setup()
    const alice = client(ALICE).client
    const bob = client(BOB).client
    await bob.ready()
    await alice.open(DM)
    const sent = await alice.send(DM, 'Это писала Алиса')

    expect(await bob.read(DM, { ...sent, authorId: ALICE })).toEqual({
      payload: { v: 1, text: 'Это писала Алиса' },
      sender: { kind: 'verified' },
    })
    // One's own messages are one's own.
    expect(await alice.read(DM, sent)).toMatchObject({ sender: { kind: 'verified' } })
  })

  it('shows who really signed a message when the server names someone else', async () => {
    const { client } = setup()
    const alice = client(ALICE).client
    const bob = client(BOB).client
    await bob.ready()
    await alice.open(DM)
    const sent = await alice.send(DM, 'Это писала Алиса')

    // The server (or whoever controls it) relabels Alice's message as Bob's own.
    expect(await bob.read(DM, { ...sent, authorId: BOB })).toEqual({
      payload: { v: 1, text: 'Это писала Алиса' },
      sender: { kind: 'mismatch', userId: ALICE },
    })
    // The local index files it under the real author.
    expect(await bob.search(DM, 'писала')).toEqual([
      { id: sent.id, authorId: ALICE, text: 'Это писала Алиса' },
    ])
  })

  it('does not vouch for a message sent just before the conversation changed keys', async () => {
    const { client } = setup()
    const alice = client(ALICE).client
    const bob = client(BOB).client
    await bob.ready()
    await alice.open(DM)
    await bob.open(DM)
    const sent = await alice.send(DM, 'Перед новым устройством')
    // Bob's phone joins: a new epoch. Bob's laptop reads the older message only afterwards.
    const bobPhone = client(BOB, 'Телефон').client
    await bobPhone.ready()
    await letIn(alice, BOB)
    await alice.open(DM)
    await bob.open(DM)

    expect(await bob.read(DM, { ...sent, authorId: ALICE })).toEqual({
      payload: { v: 1, text: 'Перед новым устройством' },
      sender: { kind: 'unverified' },
    })
  })

  it('ignores a set of reactions the server attributes to someone who did not sign it', async () => {
    const { client, delivery } = setup()
    const alice = client(ALICE).client
    const bob = client(BOB).client
    await bob.ready()
    await alice.open(DM)
    const message = await alice.send(DM, 'Кто идёт?')
    await alice.react(DM, message.id, ['👍'])
    const stored = delivery.encryptedReactions.get(`${message.id}:${ALICE}`) as string

    expect(
      await bob.readReaction(DM, message.id, { userId: BOB, version: '1', ciphertext: stored }),
    ).toEqual([])
  })

  it('encrypts only for approved devices, until the other person lets one in', async () => {
    const { client } = setup()
    const alice = client(ALICE).client
    const bob = client(BOB).client
    await bob.ready()
    await alice.open(DM)
    // Bob signs in on a phone and never approves it from the laptop.
    const bobPhone = client(BOB, 'Телефон').client
    await bobPhone.ready()
    await alice.devicesChanged(BOB)
    await alice.open(DM)

    const secret = await alice.send(DM, 'Только для подтверждённых')
    expect(await bob.read(DM, secret)).toMatchObject({
      payload: { text: 'Только для подтверждённых' },
    })
    expect(await bobPhone.read(DM, secret)).toBeNull()
    expect((await alice.safety.status([BOB])).people[0]?.newDevices.map((d) => d.name)).toEqual([
      'Телефон',
    ])

    // Bob's own laptop does not let his unapproved phone in either.
    await bob.open(DM)
    expect(await bobPhone.read(DM, await bob.send(DM, 'С ноутбука'))).toBeNull()

    // Alice compares the phone's code with Bob and lets it in.
    await letIn(alice, BOB)
    const accepted = await alice.send(DM, 'И для телефона')
    expect(await bobPhone.read(DM, accepted)).toMatchObject({ payload: { text: 'И для телефона' } })
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
    // Alice lets it in; her client adds it to the conversation when it next opens it.
    await letIn(alice, BOB)
    await alice.open(DM)
    await bobPhone.open(DM)

    expect(await bobPhone.read(DM, before)).toBeNull()
    expect(await relay(alice, bobPhone, 'Уже с телефоном')).toMatchObject({
      text: 'Уже с телефоном',
    })
    expect(await bob.read(DM, await alice.send(DM, 'И на ноутбук'))).toMatchObject({
      payload: { text: 'И на ноутбук' },
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
    expect(await bob.read(DM, secret)).toMatchObject({ payload: { text: 'Не для старого' } })
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

    const sent = await alice.send(DM, 'Вот план', { files: [file] })

    expect(delivery.messages.at(-1)?.attachmentIds).toEqual(['900'])
    expect(await bob.read(DM, sent)).toMatchObject({
      payload: { v: 1, text: 'Вот план', files: [file] },
    })
    expect(await alice.read(DM, sent)).toMatchObject({ payload: { files: [file] } })
  })

  it('edits a message: everyone reads the new text, files stay', async () => {
    const { client } = setup()
    const alice = client(ALICE).client
    const bob = client(BOB).client
    await bob.ready()
    await alice.open(DM)
    const file = { id: '900', name: 'a.txt', type: 'text/plain', size: 1, key: 'a2V5', iv: 'aXY=' }
    const sent = await alice.send(DM, 'Встреча в 5', { files: [file] })
    expect(await bob.read(DM, sent)).toMatchObject({ payload: { text: 'Встреча в 5' } })

    const edited = await alice.edit(DM, sent.id, 'Встреча в 6')

    expect(edited.editedAt).toEqual(expect.any(String))
    expect(await bob.read(DM, edited)).toMatchObject({
      payload: { v: 1, text: 'Встреча в 6', files: [file] },
    })
    expect(await alice.read(DM, edited)).toMatchObject({ payload: { text: 'Встреча в 6' } })
    // The original stays readable by what it was (an older copy of the message).
    expect(await bob.read(DM, sent)).toMatchObject({ payload: { text: 'Встреча в 5' } })
  })

  it('in a group, a device one member let in stays: the others do not take it out again', async () => {
    const { client } = setup()
    const CAROL = '3'
    const group = { id: '601', memberIds: [ALICE, BOB, CAROL] }
    const alice = client(ALICE).client
    const bob = client(BOB).client
    const carol = client(CAROL).client
    await Promise.all([bob.ready(), carol.ready()])
    await alice.open(group)
    await bob.open(group)

    // Carol's unapproved phone: Alice lets it in, Bob has not.
    const carolPhone = client(CAROL, 'Телефон').client
    await carolPhone.ready()
    await letIn(alice, CAROL)
    await alice.open(group)
    await bob.devicesChanged(CAROL)
    await bob.open(group)

    expect(await carolPhone.read(group, await bob.send(group, 'От Боба'))).toMatchObject({
      payload: { text: 'От Боба' },
    })
  })

  it('in a DM, a device the other person let in stays: its owner does not take it out again', async () => {
    const { client, delivery } = setup()
    const alice = client(ALICE).client
    const bob = client(BOB).client
    await bob.ready()
    await alice.open(DM)

    // Bob's unapproved phone: Alice compares its code and lets it in.
    const bobPhone = client(BOB, 'Телефон').client
    await bobPhone.ready()
    await letIn(alice, BOB)
    await alice.open(DM)
    // Bob's laptop does not let it in itself, but leaves it be: Alice did.
    await bob.devicesChanged(BOB)
    await bob.open(DM)
    const settled = commitCount(delivery)
    await alice.open(DM)
    await bob.open(DM)

    expect(commitCount(delivery)).toBe(settled)
    expect(await bobPhone.read(DM, await bob.send(DM, 'С ноутбука'))).toMatchObject({
      payload: { text: 'С ноутбука' },
    })
  })

  it('stops adding back a device another member keeps taking out', async () => {
    const { client, delivery } = setup()
    const alice = client(ALICE).client
    const bob = client(BOB).client
    await bob.ready()
    await alice.open(DM)
    // Alice's tablet, let in by Bob.
    const aliceTablet = client(ALICE, 'Планшет').client
    await aliceTablet.ready()
    await letIn(bob, ALICE)
    await bob.open(DM)
    await aliceTablet.open(DM)
    // Bob's phone: Alice's laptop lets it in, her tablet does not (each keeps its own consent).
    const bobPhone = client(BOB, 'Телефон').client
    await bobPhone.ready()
    await letIn(alice, BOB)
    await aliceTablet.devicesChanged(BOB)

    // Every commit wakes the other up (a handshake): the laptop adds the phone, the tablet
    // takes it out. It has to settle rather than go on for ever.
    for (let round = 0; round < 4; round += 1) {
      await alice.open(DM)
      await aliceTablet.open(DM)
    }
    const settled = commitCount(delivery)
    for (let round = 0; round < 3; round += 1) {
      await alice.open(DM)
      await aliceTablet.open(DM)
    }

    expect(commitCount(delivery)).toBe(settled)
  })

  it('in a group, takes in no one the server slips into the members: nobody here added them', async () => {
    const { client } = setup()
    const CAROL = '3'
    const MALLORY = '9'
    const group = { id: '602', memberIds: [ALICE, BOB, CAROL] }
    const alice = client(ALICE).client
    const bob = client(BOB).client
    const carol = client(CAROL).client
    const mallory = client(MALLORY).client
    await Promise.all([bob.ready(), carol.ready(), mallory.ready()])
    await alice.open(group)
    await bob.open(group)

    // The server lists Mallory as a member; no one in the group added her.
    const slipped = { ...group, memberIds: [ALICE, BOB, CAROL, MALLORY] }
    await alice.open(slipped)
    await bob.open(slipped)
    const sent = await alice.send(slipped, 'Только для своих')

    expect(await mallory.read(slipped, sent)).toBeNull()
    expect(await carol.read(slipped, sent)).toMatchObject({ payload: { text: 'Только для своих' } })
    expect((await bob.membership(slipped)).pending).toEqual([MALLORY])
    expect((await bob.membership(slipped)).notices).toEqual([])
  })

  it('takes in no one the server slips into a DM, labelled as a DM or not', async () => {
    const { client } = setup()
    const MALLORY = '9'
    const alice = client(ALICE).client
    const bob = client(BOB).client
    const mallory = client(MALLORY).client
    await Promise.all([bob.ready(), mallory.ready()])
    await alice.open(DM)
    await bob.open(DM)

    // The server lists a third person in the DM, still calling it one.
    const slipped = { ...DM, memberIds: [ALICE, BOB, MALLORY], group: false }
    await alice.admit(slipped)
    await alice.open(slipped)
    const sent = await alice.send(slipped, 'Только для Боба')

    expect(await mallory.read(slipped, sent)).toBeNull()
    expect(await bob.read(DM, sent)).toMatchObject({ payload: { text: 'Только для Боба' } })
  })

  it('in a group, takes in whom this device added, and tells the others who added whom', async () => {
    const { client } = setup()
    const CAROL = '3'
    const DAN = '4'
    const group = { id: '603', memberIds: [ALICE, BOB, CAROL] }
    const alice = client(ALICE).client
    const bob = client(BOB).client
    const carol = client(CAROL).client
    const dan = client(DAN).client
    await Promise.all([bob.ready(), carol.ready(), dan.ready()])
    await alice.open(group)
    await bob.open(group)

    const withDan = { ...group, memberIds: [ALICE, BOB, CAROL, DAN] }
    await alice.invited(group.id, [DAN])
    await alice.open(withDan)
    const sent = await alice.send(withDan, 'Привет, Дэн')

    expect(await dan.read(withDan, sent)).toMatchObject({ payload: { text: 'Привет, Дэн' } })
    await bob.open(withDan)
    const { notices, pending } = await bob.membership(withDan)
    expect(pending).toEqual([])
    expect(notices).toEqual([{ id: expect.any(String), byUserId: ALICE, userIds: [DAN] }])
    await bob.dismissNotice(withDan.id, notices[0]?.id ?? '')
    expect((await bob.membership(withDan)).notices).toEqual([])
    // A member's new device still goes in as before: Dan is one of them now.
    const danPhone = client(DAN, 'Телефон').client
    await danPhone.ready()
    await letIn(bob, DAN)
    await bob.open(withDan)
    expect(await danPhone.read(withDan, await bob.send(withDan, 'Всем'))).toMatchObject({
      payload: { text: 'Всем' },
    })
  })

  it('forgets a conversation deleted for everyone: its text and keys leave this device', async () => {
    const { client } = setup()
    const alice = client(ALICE).client
    const bobSide = client(BOB)
    await bobSide.client.ready()
    await alice.open(DM)
    const sent = await alice.send(DM, 'Удалим потом')
    expect(await bobSide.client.read(DM, sent)).toMatchObject({ payload: { text: 'Удалим потом' } })

    await bobSide.client.forgetConversation(DM.id)

    expect(await bobSide.client.search(DM, 'Удалим')).toEqual([])
    expect(await bobSide.store.get(`plain:${sent.id}`)).toBeUndefined()
    expect(await bobSide.store.get(`conv:${DM.id}`)).toBeUndefined()
  })

  it('never encrypts for someone removed from a group, even before anyone reopens it', async () => {
    const { client } = setup()
    const CAROL = '3'
    const group = { id: '600', memberIds: [ALICE, BOB, CAROL] }
    const alice = client(ALICE).client
    const bob = client(BOB).client
    const carol = client(CAROL).client
    await Promise.all([bob.ready(), carol.ready()])
    await alice.open(group)
    expect(await carol.read(group, await alice.send(group, 'Всем'))).toMatchObject({
      payload: { text: 'Всем' },
    })

    // Carol leaves the group; Alice writes at once, without opening it again.
    const withoutCarol = { ...group, memberIds: [ALICE, BOB] }
    const sent = await alice.send(withoutCarol, 'Без Кэрол')

    expect(await bob.read(withoutCarol, sent)).toMatchObject({ payload: { text: 'Без Кэрол' } })
    expect(await carol.read(group, sent)).toBeNull()
  })

  it('encrypts each person’s set of reactions; the others read it, the sender keeps its own', async () => {
    const { client, delivery } = setup()
    const alice = client(ALICE).client
    const bob = client(BOB).client
    await bob.ready()
    await alice.open(DM)
    const message = await alice.send(DM, 'Кто идёт?')

    await alice.react(DM, message.id, ['👍', '🔥'])
    const stored = delivery.encryptedReactions.get(`${message.id}:${ALICE}`)
    expect(stored).toEqual(expect.any(String))
    const reaction = { userId: ALICE, version: '1', ciphertext: stored as string }

    expect(await bob.readReaction(DM, message.id, reaction)).toEqual(['👍', '🔥'])
    expect(await alice.readReaction(DM, message.id, reaction)).toEqual(['👍', '🔥'])
    await alice.react(DM, message.id, [])
    expect(delivery.encryptedReactions.has(`${message.id}:${ALICE}`)).toBe(false)
  })

  it('searches what this device decrypted, here only, newest first', async () => {
    const { client } = setup()
    const alice = client(ALICE).client
    const bob = client(BOB).client
    await bob.ready()
    await alice.open(DM)
    const first = await alice.send(DM, 'Встреча в пятницу')
    const second = await bob.send(DM, 'Встреча переносится')
    await alice.send(DM, 'Купи хлеба')
    await alice.read(DM, { ...second, authorId: BOB })
    await alice.edit(DM, first.id, 'Встреча в субботу')

    const found = await alice.search(DM, 'встреча')

    expect(found).toEqual([
      { id: second.id, authorId: BOB, text: 'Встреча переносится' },
      { id: first.id, authorId: ALICE, text: 'Встреча в субботу' },
    ])
    expect(await alice.search({ ...DM, id: '501' }, 'встреча')).toEqual([])
    expect(await alice.search(DM, '  ')).toEqual([])
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
    await letIn(alice, BOB)
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

  it('waits to be let in after its device was removed elsewhere and registered anew', async () => {
    const { client, delivery } = setup()
    const bob = client(BOB).client
    await bob.ready()
    const aliceSide = client(ALICE)
    const oldId = await aliceSide.client.open(DM).then(() => aliceSide.client.ready())
    const before = await bob.send(DM, 'До перерегистрации')
    expect(await aliceSide.client.read(DM, before)).toMatchObject({
      payload: { text: 'До перерегистрации' },
    })

    // Removed from another device; the page reloads with the same storage.
    await delivery.apiFor(ALICE).e2ee.deleteDevice(oldId)
    const again = client(ALICE, 'Браузер', aliceSide.store).client
    expect(await again.ready()).not.toBe(oldId)

    expect(await again.open(DM)).toBe('waiting')
    // What the old device decrypted stays readable.
    expect(await again.read(DM, before)).toMatchObject({ payload: { text: 'До перерегистрации' } })

    await letIn(bob, ALICE)
    await bob.open(DM)
    expect(await again.open(DM)).toBe('ready')
    expect(await relay(bob, again, 'Уже с новым')).toMatchObject({ text: 'Уже с новым' })
    expect(await relay(again, bob, 'И обратно')).toMatchObject({ text: 'И обратно' })
  })

  it('brings an approved device of mine into a conversation nobody has opened since', async () => {
    const { client } = setup()
    const bob = client(BOB).client
    await bob.ready()
    const laptop = client(ALICE, 'Ноутбук').client
    await laptop.open(DM)
    // My keys reset here; the phone is approved with the new recovery key.
    await laptop.recovery.reset({ password: 'password123' })
    const phone = client(ALICE, 'Телефон').client
    expect(await phone.recovery.useKey((await laptop.recovery.key()) as string)).toBe('ok')
    expect(await phone.open(DM)).toBe('waiting')

    // In the background, without the conversation open on the laptop.
    await laptop.devicesChanged(ALICE)
    await laptop.admit(DM)

    expect(await phone.open(DM)).toBe('ready')
    expect(await relay(laptop, phone, 'Теперь и на телефоне')).toMatchObject({
      text: 'Теперь и на телефоне',
    })
  })

  it('waits for a new Welcome after the other side took this device out, then reads again', async () => {
    const { client } = setup()
    const bob = client(BOB).client
    await bob.ready()
    const laptop = client(ALICE, 'Ноутбук').client
    await laptop.open(DM)
    await bob.open(DM)

    // Alice resets her keys: Bob doesn't know the new one, so his client takes her laptop out.
    await laptop.recovery.reset({ password: 'password123' })
    await bob.devicesChanged(ALICE)
    await bob.admit(DM)
    expect(await laptop.open(DM)).toBe('waiting')
    expect(await laptop.callKey(DM)).toBeNull()

    // Bob accepts the new key: the laptop is let in again.
    await bob.safety.acceptKey(ALICE)
    await bob.admit(DM)
    expect(await laptop.open(DM)).toBe('ready')
    expect(await relay(bob, laptop, 'Снова вместе')).toMatchObject({ text: 'Снова вместе' })
    expect(await relay(laptop, bob, 'Ага')).toMatchObject({ text: 'Ага' })
  })

  it('admits devices only where this device is already in: it starts no conversation', async () => {
    const { client, delivery } = setup()
    const bob = client(BOB).client
    await bob.ready()
    const alice = client(ALICE).client
    await alice.ready()

    await alice.admit(DM)

    expect(commitCount(delivery)).toBe(0)
  })

  it('ignores saved group state that belongs to another device of this browser', async () => {
    const { client } = setup()
    const bob = client(BOB).client
    await bob.ready()
    const aliceSide = client(ALICE)
    await aliceSide.client.open(DM)
    const stale = await aliceSide.store.get('conv:500')

    // Another device's state ends up here (a restored profile, a swapped storage).
    const elsewhere = client(ALICE, 'Другой')
    await elsewhere.client.ready()
    await elsewhere.store.set('conv:500', stale)

    expect(await elsewhere.client.open(DM)).toBe('waiting')
  })

  it('forgets everything on sign-out: the device is revoked and the next sign-in is a new one', async () => {
    const { client, delivery } = setup()
    const alice = client(ALICE).client
    const bobSide = client(BOB)
    const bobId = await bobSide.client.ready()
    await alice.open(DM)
    const sent = await alice.send(DM, 'Пока Боб был здесь')
    expect(await bobSide.client.read(DM, sent)).toMatchObject({
      payload: { text: 'Пока Боб был здесь' },
    })

    await bobSide.client.forget()

    expect(delivery.devices.find((d) => d.id === bobId)?.revokedAt).toEqual(expect.any(String))
    expect(await bobSide.store.get('device')).toBeUndefined()
    expect(await bobSide.store.get(`plain:${sent.id}`)).toBeUndefined()
    // Signing in again on this browser: a new device, which the old message was not for.
    const again = createE2eeClient({
      api: delivery.apiFor(BOB),
      store: bobSide.store,
      userId: BOB,
      deviceName: 'Браузер',
    })
    expect(await again.ready()).not.toBe(bobId)
    expect(await again.read(DM, sent)).toBeNull()
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
