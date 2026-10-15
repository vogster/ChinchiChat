import { REPLY_SNIPPET_LENGTH } from '@chinchi/shared'
import sharp from 'sharp'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { uploadFile } from '../../../test/attachment-helpers'
import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, events, close } = createTestApp()

let owner: TestActor
let member: TestActor
let textId: string
let otherTextId: string

const post = async (actor: TestActor, payload: object, channelId = textId) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/channels/${channelId}/messages`,
    headers: actor.headers,
    payload,
  })

const send = async (actor: TestActor, payload: object, channelId = textId) => {
  const response = await post(actor, payload, channelId)
  expect(response.statusCode).toBe(201)
  return response.json().data.message as { id: string; reply: unknown }
}

const history = async () => {
  const response = await app.inject({
    method: 'GET',
    url: `/api/v1/channels/${textId}/messages`,
    headers: owner.headers,
  })
  return response.json().data.messages as { id: string; reply: unknown }[]
}

beforeEach(async () => {
  await resetState(db, redis)
  events.clear()
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
  member = await signUp(app, { username: 'member', email: 'member@example.com' })
  const guild = await createGuild(app, owner)
  await addMember(db, guild.id, member.id)
  textId = guild.channels.find((c) => c.type === 'text')?.id as string
  const other = await app.inject({
    method: 'POST',
    url: `/api/v1/guilds/${guild.id}/channels`,
    headers: owner.headers,
    payload: { type: 'text', name: 'other' },
  })
  otherTextId = other.json().data.channel.id
})

afterAll(async () => {
  await close()
})

describe('replies', () => {
  it('carries a snippet of the original in the response, events and history', async () => {
    const long = `${'a'.repeat(REPLY_SNIPPET_LENGTH)}TAIL`
    const original = await send(owner, { content: long })

    const reply = await send(member, { content: 'agreed', replyTo: original.id })

    const expected = {
      messageId: original.id,
      mentionsAuthor: true,
      message: {
        author: { id: owner.id, username: 'owner', displayName: null, avatarUrl: null },
        content: 'a'.repeat(REPLY_SNIPPET_LENGTH),
        attachmentCount: 0,
      },
    }
    expect(reply.reply).toEqual(expected)
    expect(events.published.at(-1)).toMatchObject({
      type: 'MESSAGE_CREATE',
      data: { reply: expected },
    })
    expect((await history()).at(-1)?.reply).toEqual(expected)
    expect((await history()).at(0)?.reply).toBeNull()
  })

  it('counts the attachments of the original', async () => {
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#000' } })
      .png()
      .toBuffer()
    const upload = await uploadFile(app, owner, textId, new Uint8Array(png))
    const original = await send(owner, { attachmentIds: [upload.id] })

    const reply = await send(member, { content: 'nice', replyTo: original.id })

    expect(reply.reply).toMatchObject({ message: { content: '', attachmentCount: 1 } })
  })

  it('follows edits and deletion of the original', async () => {
    const original = await send(owner, { content: 'first' })
    const reply = await send(member, { content: 're', replyTo: original.id })

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/channels/${textId}/messages/${original.id}`,
      headers: owner.headers,
      payload: { content: 'second' },
    })
    expect((await history()).find((m) => m.id === reply.id)?.reply).toMatchObject({
      message: { content: 'second' },
    })

    await app.inject({
      method: 'DELETE',
      url: `/api/v1/channels/${textId}/messages/${original.id}`,
      headers: owner.headers,
    })
    expect((await history()).find((m) => m.id === reply.id)?.reply).toEqual({
      messageId: original.id,
      mentionsAuthor: true,
      message: null,
    })
  })

  it('remembers replies that do not notify the author', async () => {
    const original = await send(owner, { content: 'q' })
    const reply = await send(member, { content: 'a', replyTo: original.id, replyMention: false })

    expect(reply.reply).toMatchObject({ mentionsAuthor: false })
    expect((await history()).at(-1)?.reply).toMatchObject({ mentionsAuthor: false })
  })

  it.each([
    ['a message in another channel', true],
    ['a message that does not exist', false],
  ])('refuses replying to %s', async (_case, exists) => {
    const target = exists ? (await send(owner, { content: 'x' }, otherTextId)).id : '123456789'
    const response = await post(member, { content: 're', replyTo: target })
    expect(response.statusCode).toBe(400)
    expect(response.json().code).toBe('INVALID_REPLY')
  })
})
