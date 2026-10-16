import { describe, expect, it } from 'vitest'

import {
  addMembers,
  createConversation,
  encryptMessage,
  epoch,
  exportSecret,
  joinConversation,
  loadConversation,
  members,
  processIncoming,
  removeMembers,
  saveConversation,
} from './conversation'
import { createDeviceKeys, createKeyPackages } from './device'

import type { Conversation, ConversationOptions } from './conversation'
import type { DeviceKeys, KeyPackageBundle } from './device'
import type { CryptoBackend } from './suite'

const te = new TextEncoder()
const td = new TextDecoder()
const trustAll: ConversationOptions = { trust: async () => true }

interface Device {
  keys: DeviceKeys
  bundle: KeyPackageBundle
  backend: CryptoBackend
  conversation?: Conversation
}

const device = async (userId: string, deviceId: string, backend: CryptoBackend = 'webcrypto') => {
  const keys = await createDeviceKeys({ userId, deviceId }, backend)
  const [bundle] = await createKeyPackages(keys, 1, backend)
  return { keys, bundle: bundle as KeyPackageBundle, backend } satisfies Device
}

const conversationOf = (d: Device) => {
  if (!d.conversation) throw new Error(`${d.keys.identity.deviceId} is not in the conversation`)
  return d.conversation
}

/** Alice's phone starts a DM; her laptop, Bob and Carol (pure JS) join. */
const startGroup = async () => {
  const alicePhone: Device = await device('1', '11')
  const aliceLaptop: Device = await device('1', '12')
  const bob: Device = await device('2', '21')
  const carol: Device = await device('3', '31', 'pure')
  alicePhone.conversation = await createConversation(te.encode('dm-1'), alicePhone.bundle, trustAll)
  const added = await addMembers(
    alicePhone.conversation,
    [aliceLaptop.bundle.publicPackage, bob.bundle.publicPackage, carol.bundle.publicPackage],
    trustAll,
  )
  alicePhone.conversation = added.conversation
  for (const d of [aliceLaptop, bob, carol]) {
    d.conversation = await joinConversation(added.welcome, d.bundle, {
      ...trustAll,
      backend: d.backend,
    })
  }
  return { alicePhone, aliceLaptop, bob, carol }
}

const send = async (from: Device, text: string) => {
  const result = await encryptMessage(conversationOf(from), te.encode(text), {
    backend: from.backend,
  })
  from.conversation = result.conversation
  return result.ciphertext
}

const receive = async (to: Device, bytes: Uint8Array) => {
  const result = await processIncoming(conversationOf(to), bytes, { backend: to.backend })
  to.conversation = result.conversation
  return result.incoming
}

describe('encrypted conversations', () => {
  it('let every device read every other, knowing who sent what', async () => {
    const { alicePhone, aliceLaptop, bob, carol } = await startGroup()

    expect(
      members(conversationOf(bob))
        .map((m) => m.identity.deviceId)
        .sort(),
    ).toEqual(['11', '12', '21', '31'])
    const hello = await send(bob, 'Привет всем')
    for (const d of [alicePhone, aliceLaptop, carol]) {
      const incoming = await receive(d, hello)
      expect(incoming).toMatchObject({ kind: 'message', sender: { userId: '2', deviceId: '21' } })
      if (incoming.kind === 'message') expect(td.decode(incoming.plaintext)).toBe('Привет всем')
    }
  })

  it('survive saving and loading a device’s state', async () => {
    const { alicePhone, aliceLaptop } = await startGroup()
    aliceLaptop.conversation = loadConversation(
      saveConversation(conversationOf(aliceLaptop)),
      trustAll,
    )

    const incoming = await receive(aliceLaptop, await send(alicePhone, 'После перезапуска'))
    expect(incoming.kind === 'message' && td.decode(incoming.plaintext)).toBe('После перезапуска')
  })

  it('give every member the same call key, which changes when someone is removed', async () => {
    const { alicePhone, bob, carol } = await startGroup()
    const key = await exportSecret(conversationOf(alicePhone), 'chinchi call')
    expect(await exportSecret(conversationOf(bob), 'chinchi call')).toEqual(key)
    expect(
      await exportSecret(conversationOf(carol), 'chinchi call', 32, { backend: 'pure' }),
    ).toEqual(key)

    const removal = await removeMembers(conversationOf(alicePhone), [carol.keys.identity], trustAll)
    alicePhone.conversation = removal.conversation
    expect(await receive(bob, removal.commit)).toEqual({ kind: 'commit' })
    expect(await exportSecret(conversationOf(bob), 'chinchi call')).not.toEqual(key)
    expect(epoch(conversationOf(bob))).toBe(epoch(conversationOf(alicePhone)))
  })

  it('shut a removed device out of what follows', async () => {
    const { alicePhone, aliceLaptop, bob, carol } = await startGroup()
    const removal = await removeMembers(conversationOf(alicePhone), [carol.keys.identity], trustAll)
    alicePhone.conversation = removal.conversation
    await receive(aliceLaptop, removal.commit)
    await receive(bob, removal.commit)

    const secret = await send(bob, 'Без Кэрол')

    expect((await receive(aliceLaptop, secret)).kind).toBe('message')
    await expect(receive(carol, secret)).rejects.toThrow()
    expect(members(conversationOf(bob)).map((m) => m.identity.userId)).not.toContain('3')
  })

  it('refuse devices the app does not trust', async () => {
    const alice = await device('1', '11')
    const stranger = await device('9', '91')
    const options: ConversationOptions = {
      trust: async (identity) => identity.userId !== '9',
    }
    const conversation = await createConversation(te.encode('dm-2'), alice.bundle, options)

    await expect(
      addMembers(conversation, [stranger.bundle.publicPackage], options),
    ).rejects.toThrow()
  })

  it('order competing commits: the first wins, the other device retries from it', async () => {
    const { alicePhone, aliceLaptop, bob, carol } = await startGroup()
    // A commit uses up secrets of the state it starts from: keep a saved copy to roll back to.
    const before = saveConversation(conversationOf(bob))
    // Both remove Carol at the same epoch; the server keeps Alice's commit.
    const first = await removeMembers(conversationOf(alicePhone), [carol.keys.identity], trustAll)
    const second = await removeMembers(conversationOf(bob), [carol.keys.identity], trustAll)
    alicePhone.conversation = first.conversation

    await receive(aliceLaptop, first.commit)
    await expect(processIncoming(conversationOf(aliceLaptop), second.commit)).rejects.toThrow()
    // Bob drops his own commit and applies the winner from the state he had.
    bob.conversation = loadConversation(before, trustAll)
    await receive(bob, first.commit)

    const after = await send(bob, 'Снова вместе')
    expect((await receive(alicePhone, after)).kind).toBe('message')
  })

  it('reject a tampered ciphertext', async () => {
    const { alicePhone, bob } = await startGroup()
    const bytes = await send(alicePhone, 'Подлинное')
    const tampered = bytes.slice()
    tampered[tampered.length - 5] = (tampered[tampered.length - 5] ?? 0) ^ 0xff

    await expect(receive(bob, tampered)).rejects.toThrow()
  })

  it('open a message once: a replay of it is refused (fast path, current epoch)', async () => {
    const { alicePhone, bob } = await startGroup()
    const bytes = await send(alicePhone, 'Один раз')

    expect(await receive(bob, bytes)).toMatchObject({
      kind: 'message',
      sender: { userId: '1', deviceId: '11' },
    })
    await expect(receive(bob, bytes)).rejects.toThrow()
  })

  it('keep their state after refusing a tampered message and read the next one', async () => {
    const { alicePhone, bob } = await startGroup()
    const bad = (await send(alicePhone, 'Подделка')).slice()
    bad[bad.length - 1] = (bad[bad.length - 1] ?? 0) ^ 0x01
    await expect(receive(bob, bad)).rejects.toThrow()

    const good = await send(alicePhone, 'Настоящее')
    const incoming = await receive(bob, good)
    expect(incoming).toMatchObject({ kind: 'message', sender: { userId: '1', deviceId: '11' } })
    if (incoming.kind === 'message') expect(td.decode(incoming.plaintext)).toBe('Настоящее')
  })

  it('still read a message sent just before a commit, without vouching for its sender', async () => {
    const { alicePhone, bob, carol } = await startGroup()
    const late = await send(bob, 'Отправлено до коммита')
    const removal = await removeMembers(conversationOf(alicePhone), [carol.keys.identity], trustAll)
    alicePhone.conversation = removal.conversation

    const incoming = await receive(alicePhone, late)

    expect(incoming).toMatchObject({ kind: 'message', sender: null })
  })

  it('refuse bytes of the wrong kind', async () => {
    const { alicePhone, bob } = await startGroup()
    const notAWelcome = await send(alicePhone, 'обычное сообщение')

    await expect(joinConversation(notAWelcome, bob.bundle, trustAll)).rejects.toThrow(
      'Not a Welcome',
    )
    await expect(processIncoming(conversationOf(bob), bob.bundle.publicPackage)).rejects.toThrow(
      'Not a group message',
    )
    await expect(processIncoming(conversationOf(bob), new Uint8Array([1, 2, 3]))).rejects.toThrow()
    expect(() => loadConversation(new Uint8Array([1, 2, 3]), trustAll)).toThrow()
  })
})
