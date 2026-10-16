import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, close } = createTestApp()

let alice: TestActor
let bob: TestActor
let outsider: TestActor
let general: string
let news: string

/** A valid 1×1 PNG: it passes the signature check and its metadata scan. */
const PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
    'base64',
  ),
)

const call = (actor: TestActor, method: 'GET' | 'POST', url: string, payload?: object) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: actor.headers,
    ...(payload ? { payload } : {}),
  })

const post = async (actor: TestActor, channelId: string, body: object) =>
  call(actor, 'POST', `/channels/${channelId}/messages`, body)

const forward = (
  actor: TestActor,
  target: string,
  source: { channelId: string; messageId: string },
  content?: string,
) => post(actor, target, { forward: source, ...(content ? { content } : {}) })

beforeAll(async () => {
  await app.listen({ host: '127.0.0.1', port: 0 })
})

beforeEach(async () => {
  await resetState(db, redis)
  alice = await signUp(app, { username: 'alice', email: 'alice@example.com' })
  bob = await signUp(app, { username: 'bob', email: 'bob@example.com' })
  outsider = await signUp(app, { username: 'outsider', email: 'outsider@example.com' })
  const guild = await createGuild(app, alice)
  await addMember(db, guild.id, bob.id)
  general = guild.channels.find((c: { type: string }) => c.type === 'text')?.id as string
  news = (
    await call(alice, 'POST', `/guilds/${guild.id}/channels`, { name: 'новости', type: 'text' })
  ).json().data.channel.id
})

afterAll(close)

describe('forwarding', () => {
  it('copies the message into another channel, marked forwarded, without pinging anyone', async () => {
    const original = (await post(bob, general, { content: 'Собрание в 18:00 @everyone' })).json()
      .data.message

    const sent = await forward(alice, news, { channelId: general, messageId: original.id }, 'Важно')

    expect(sent.statusCode).toBe(201)
    const message = sent.json().data.message
    expect(message).toMatchObject({
      channelId: news,
      content: 'Важно',
      mentions: { users: [], roles: [], everyone: false, here: false },
      forward: {
        channelId: general,
        messageId: original.id,
        author: { id: bob.id, username: 'bob' },
        content: 'Собрание в 18:00 @everyone',
        createdAt: original.createdAt,
      },
    })
    const history = (await call(bob, 'GET', `/channels/${news}/messages`)).json().data.messages
    expect(history[0].forward.content).toBe('Собрание в 18:00 @everyone')
  })

  it('reaches a DM, and copies the files so they open there', async () => {
    const slot = (
      await call(bob, 'POST', `/channels/${general}/attachments`, {
        filename: 'cat.png',
        size: PNG.byteLength,
        contentType: 'image/png',
      })
    ).json().data.attachment
    await fetch(slot.uploadUrl, { method: 'PUT', headers: slot.headers, body: PNG })
    const original = (await post(bob, general, { attachmentIds: [slot.id] })).json().data.message
    const dm = (await call(alice, 'POST', '/users/@me/channels', { recipientIds: [bob.id] })).json()
      .data.channel

    const message = (
      await forward(alice, dm.id, { channelId: general, messageId: original.id })
    ).json().data.message

    expect(message.attachments).toHaveLength(1)
    const [copy] = message.attachments
    expect(copy).toMatchObject({ filename: 'cat.png', contentType: 'image/png' })
    expect(copy.id).not.toBe(original.attachments[0].id)
    const download = await app.inject({ method: 'GET', url: copy.url, headers: bob.headers })
    expect(download.statusCode).toBe(302)
  })

  it('needs the original to be visible and the target writable', async () => {
    const original = (await post(bob, general, { content: 'только для сервера' })).json().data
      .message

    const unseen = await forward(outsider, general, { channelId: general, messageId: original.id })
    expect(unseen.statusCode).toBe(404)
    const missing = await forward(alice, news, { channelId: general, messageId: '1' })
    expect(missing.json().code).toBe('UNKNOWN_MESSAGE')
  })

  it('leaves encrypted conversations out, both ways', async () => {
    const encrypted = (
      await call(alice, 'POST', '/users/@me/channels', { recipientIds: [bob.id], encrypted: true })
    ).json().data.channel
    const secret = (await post(alice, encrypted.id, { ciphertext: 'AAAA' })).json().data.message
    const plain = (await post(bob, general, { content: 'открыто' })).json().data.message

    const out = await forward(alice, general, { channelId: encrypted.id, messageId: secret.id })
    expect(out.json().code).toBe('ENCRYPTED_CHANNEL')
    const into = await forward(alice, encrypted.id, { channelId: general, messageId: plain.id })
    expect(into.json().code).toBe('ENCRYPTED_CHANNEL')
  })
})
