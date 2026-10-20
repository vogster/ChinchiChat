import { Permission } from '@chinchi/shared'
import { sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { testStorageConfig } from '../../../test/storage'
import { createTestApp, resetState } from '../../../test/test-app'
import { createObjectStorage } from '../../storage/object-storage'
import { MAX_PENDING_UPLOADS } from './attachment.service'

import type { TestActor } from '../../../test/guild-helpers'

const MAX_BYTES = 128
const { app, db, redis, events, close } = createTestApp({
  env: { UPLOAD_MAX_BYTES: String(MAX_BYTES) },
})
const storage = createObjectStorage(testStorageConfig())

/** A valid 1×1 PNG: it passes the signature check and its metadata scan. */
const PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
    'base64',
  ),
)
const TEXT = new TextEncoder().encode('hello, world')
/** An EBML (WebM) header and a few bytes: enough for the signature check. */
const WEBM = Uint8Array.from([
  0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01,
])

let owner: TestActor
let member: TestActor
let outsider: TestActor
let guild: Awaited<ReturnType<typeof createGuild>>
let textId: string
let voiceId: string

interface Upload {
  id: string
  uploadUrl: string
  method: 'PUT'
  headers: Record<string, string>
  expiresAt: string
}

const call = (
  actor: TestActor,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  payload?: object,
) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: actor.headers,
    ...(payload ? { payload } : {}),
  })

const requestUpload = (
  actor: TestActor,
  body: { filename: string; size: number; contentType?: string },
  channelId = textId,
) => call(actor, 'POST', `/channels/${channelId}/attachments`, body)

/** Requests an upload slot and puts the bytes into storage, as a client would. */
const upload = async (
  actor: TestActor,
  bytes: Uint8Array,
  { filename = 'cat.png', contentType = 'image/png' } = {},
): Promise<Upload> => {
  const response = await requestUpload(actor, { filename, size: bytes.byteLength, contentType })
  expect(response.statusCode).toBe(201)
  const slot = response.json().data.attachment as Upload
  const put = await fetch(slot.uploadUrl, { method: 'PUT', headers: slot.headers, body: bytes })
  expect(put.ok).toBe(true)
  return slot
}

const sendWith = (actor: TestActor, attachmentIds: string[], content?: string) =>
  call(actor, 'POST', `/channels/${textId}/messages`, {
    attachmentIds,
    ...(content ? { content } : {}),
  })

const uploadKeyOf = (attachmentId: string) => `uploads/${textId}/${attachmentId}`
const keyOf = (messageId: string, attachmentId: string) =>
  `attachments/${textId}/${messageId}/${attachmentId}`

beforeEach(async () => {
  await resetState(db, redis)
  events.clear()
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
  member = await signUp(app, { username: 'member', email: 'member@example.com' })
  outsider = await signUp(app, { username: 'outsider', email: 'outsider@example.com' })
  guild = await createGuild(app, owner)
  await addMember(db, guild.id, member.id)
  textId = guild.channels.find((c) => c.type === 'text')?.id as string
  voiceId = guild.channels.find((c) => c.type === 'voice')?.id as string
})

afterAll(async () => {
  await close()
})

describe('POST /api/v1/channels/:id/attachments', () => {
  it('returns a presigned upload for the exact size and type', async () => {
    const response = await requestUpload(member, {
      filename: '../cat.png',
      size: PNG.byteLength,
      contentType: 'image/png',
    })

    expect(response.statusCode).toBe(201)
    const slot = response.json().data.attachment as Upload
    expect(slot).toMatchObject({ method: 'PUT', headers: { 'Content-Type': 'image/png' } })
    expect(new Date(slot.expiresAt).getTime()).toBeGreaterThan(Date.now())
    expect(slot.uploadUrl).toContain(`/uploads/${textId}/${slot.id}`)
  })

  it('rejects files over the instance limit', async () => {
    const response = await requestUpload(member, { filename: 'big.bin', size: MAX_BYTES + 1 })
    expect(response.statusCode).toBe(400)
    expect(response.json().code).toBe('FILE_TOO_LARGE')
  })

  it('requires ATTACH_FILES in the channel', async () => {
    await call(owner, 'PUT', `/channels/${textId}/permissions/${guild.id}`, {
      targetType: 'role',
      allow: '0',
      deny: String(Permission.AttachFiles),
    })
    const response = await requestUpload(member, { filename: 'a.png', size: 1 })
    expect(response.statusCode).toBe(403)
    expect(response.json().code).toBe('MISSING_PERMISSIONS')
  })

  it('caps unsent uploads per user', async () => {
    const ids = await Promise.all(
      Array.from({ length: MAX_PENDING_UPLOADS }, () =>
        requestUpload(member, { filename: 'a.bin', size: 1 }),
      ),
    )
    expect(ids.every((response) => response.statusCode === 201)).toBe(true)

    const over = await requestUpload(member, { filename: 'a.bin', size: 1 })
    expect(over.statusCode).toBe(429)
    expect(over.json().code).toBe('TOO_MANY_PENDING_UPLOADS')
    // Others are not affected.
    expect((await requestUpload(owner, { filename: 'a.bin', size: 1 })).statusCode).toBe(201)
  })

  it('hides channels from non-members and refuses voice channels', async () => {
    expect((await requestUpload(outsider, { filename: 'a', size: 1 })).statusCode).toBe(404)
    const voice = await requestUpload(member, { filename: 'a', size: 1 }, voiceId)
    expect(voice.statusCode).toBe(400)
    expect(voice.json().code).toBe('INVALID_CHANNEL')
  })
})

describe('sending messages with attachments', () => {
  it('attaches uploaded files, with or without text, and broadcasts them', async () => {
    const image = await upload(member, PNG)
    const doc = await upload(member, TEXT, { filename: 'notes.txt', contentType: 'text/plain' })

    const response = await sendWith(member, [image.id, doc.id])

    expect(response.statusCode).toBe(201)
    const message = response.json().data.message
    expect(message.content).toBe('')
    expect(message.attachments).toEqual([
      {
        id: image.id,
        filename: 'cat.png',
        size: PNG.byteLength,
        contentType: 'image/png',
        url: `/api/v1/attachments/${image.id}/cat.png`,
        width: null,
        height: null,
        previewUrl: null,
      },
      {
        id: doc.id,
        filename: 'notes.txt',
        size: TEXT.byteLength,
        contentType: 'text/plain',
        url: `/api/v1/attachments/${doc.id}/notes.txt`,
        width: null,
        height: null,
        previewUrl: null,
      },
    ])
    expect(events.published.at(-1)).toMatchObject({
      type: 'MESSAGE_CREATE',
      data: { attachments: message.attachments },
    })

    const history = await call(member, 'GET', `/channels/${textId}/messages`)
    expect(history.json().data.messages.at(-1).attachments).toEqual(message.attachments)
  })

  it('keeps attachments when the text is edited', async () => {
    const image = await upload(member, PNG)
    const sent = (await sendWith(member, [image.id], 'look')).json().data.message
    const edited = await app.inject({
      method: 'PATCH',
      url: `/api/v1/channels/${textId}/messages/${sent.id}`,
      headers: member.headers,
      payload: { content: 'look at this' },
    })
    expect(edited.json().data.message.attachments).toEqual(sent.attachments)
  })

  it.each([
    [
      'never uploaded',
      async () => (await requestUpload(member, { filename: 'a', size: 3 })).json(),
    ],
    ['uploaded by someone else', async () => ({ data: { attachment: await upload(owner, PNG) } })],
  ])('rejects an attachment that was %s', async (_case, makeSlot) => {
    const slot = (await makeSlot()).data.attachment as Upload
    const response = await sendWith(member, [slot.id], 'hi')
    expect(response.statusCode).toBe(400)
    expect(response.json().code).toBe('INVALID_ATTACHMENT')
  })

  it('rejects an attachment that was already sent', async () => {
    const image = await upload(member, PNG)
    expect((await sendWith(member, [image.id])).statusCode).toBe(201)
    const again = await sendWith(member, [image.id])
    expect(again.statusCode).toBe(400)
    expect(again.json().code).toBe('INVALID_ATTACHMENT')
  })

  it('rejects an expired upload', async () => {
    const image = await upload(member, PNG)
    await db.execute(
      sql`update attachments set created_at = now() - interval '2 hours' where id = ${image.id}`,
    )
    expect((await sendWith(member, [image.id])).json().code).toBe('INVALID_ATTACHMENT')
  })

  it('rejects files declared as images that are not', async () => {
    const fake = await upload(member, TEXT, { filename: 'x.png', contentType: 'image/png' })
    const response = await sendWith(member, [fake.id])
    expect(response.statusCode).toBe(400)
    expect(response.json().code).toBe('INVALID_ATTACHMENT')
  })

  it('rejects files declared as voice audio that are not', async () => {
    const fake = await upload(member, TEXT, { filename: 'voice.webm', contentType: 'audio/webm' })
    const response = await sendWith(member, [fake.id])
    expect(response.statusCode).toBe(400)
    expect(response.json().code).toBe('INVALID_ATTACHMENT')
  })

  it('requires ATTACH_FILES to send attachments', async () => {
    const image = await upload(member, PNG)
    await call(owner, 'PUT', `/channels/${textId}/permissions/${guild.id}`, {
      targetType: 'role',
      allow: '0',
      deny: String(Permission.AttachFiles),
    })
    expect((await sendWith(member, [image.id])).statusCode).toBe(403)
  })

  it('removes stored files when the message is deleted', async () => {
    const image = await upload(member, PNG)
    const sent = (await sendWith(member, [image.id])).json().data.message
    expect(await storage.stat(keyOf(sent.id, image.id))).not.toBeNull()

    expect(
      (await call(member, 'DELETE', `/channels/${textId}/messages/${sent.id}`)).statusCode,
    ).toBe(204)
    expect(await storage.stat(keyOf(sent.id, image.id))).toBeNull()
  })

  it('freezes the file when the message is sent: re-uploading through the slot changes nothing', async () => {
    const image = await upload(member, PNG)
    const sent = (await sendWith(member, [image.id])).json().data.message
    expect(await storage.stat(uploadKeyOf(image.id))).toBeNull()

    const swapped = PNG.map((byte, index) => (index >= 8 ? 0xee : byte))
    await fetch(image.uploadUrl, { method: 'PUT', headers: image.headers, body: swapped })

    const stored = await storage.readStart(keyOf(sent.id, image.id), PNG.byteLength)
    expect(stored).toEqual(PNG)
  })

  it('leaves no copies behind when a send fails', async () => {
    const image = await upload(member, PNG)
    const fake = await upload(member, TEXT, { filename: 'x.png', contentType: 'image/png' })
    expect((await sendWith(member, [image.id, fake.id])).statusCode).toBe(400)

    // The good upload can still be sent on its own.
    const sent = await sendWith(member, [image.id])
    expect(sent.statusCode).toBe(201)
  })
})

describe('GET /api/v1/attachments/:id/:filename', () => {
  const download = (actor: TestActor, url: string) =>
    app.inject({ method: 'GET', url, headers: actor.headers })

  it('redirects members to a cacheable presigned URL that serves images inline', async () => {
    const image = await upload(member, PNG)
    const [attachment] = (await sendWith(member, [image.id])).json().data.message.attachments

    const response = await download(owner, attachment.url)

    expect(response.statusCode).toBe(302)
    expect(response.headers['cache-control']).toMatch(/^private, max-age=\d+$/)
    const file = await fetch(response.headers.location as string)
    expect(file.headers.get('content-type')).toBe('image/png')
    expect(file.headers.get('content-disposition')).toMatch(/^inline; /)
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(PNG)
    expect((await download(owner, attachment.url)).headers.location).toBe(response.headers.location)
  })

  it('serves voice audio inline with its type, so a player can play it', async () => {
    const voice = await upload(member, WEBM, {
      filename: 'voice-2026-10-21-14-05.webm',
      contentType: 'audio/webm',
    })
    const [attachment] = (await sendWith(member, [voice.id])).json().data.message.attachments

    const file = await fetch((await download(member, attachment.url)).headers.location as string)
    expect(file.headers.get('content-type')).toBe('audio/webm')
    expect(file.headers.get('content-disposition')).toMatch(/^inline; /)
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(WEBM)
  })

  it('makes everything that is not a safe image a download', async () => {
    const doc = await upload(member, TEXT, { filename: 'page.html', contentType: 'text/html' })
    const [attachment] = (await sendWith(member, [doc.id])).json().data.message.attachments

    const file = await fetch((await download(member, attachment.url)).headers.location as string)
    expect(file.headers.get('content-disposition')).toMatch(/^attachment; /)
    // Never served as something a page could load as a script or stylesheet.
    expect(file.headers.get('content-type')).toBe('application/octet-stream')
    expect(attachment.contentType).toBe('text/html')
  })

  it('hides attachments from people who cannot read the channel, and unsent ones', async () => {
    const image = await upload(member, PNG)
    const pending = await upload(member, PNG)
    const [attachment] = (await sendWith(member, [image.id])).json().data.message.attachments

    const hidden = await download(outsider, attachment.url)
    expect(hidden.statusCode).toBe(404)
    expect(hidden.json().code).toBe('UNKNOWN_ATTACHMENT')
    expect((await download(member, `/api/v1/attachments/${pending.id}/cat.png`)).statusCode).toBe(
      404,
    )
  })
})

describe('without object storage', () => {
  const bare = createTestApp({ storage: false })

  afterAll(async () => {
    await bare.close()
  })

  it('reports uploads as disabled', async () => {
    const actor = await signUp(bare.app, { username: 'solo', email: 'solo@example.com' })
    const own = await createGuild(bare.app, actor)
    const channelId = own.channels.find((c) => c.type === 'text')?.id as string

    const instance = await bare.app.inject({ method: 'GET', url: '/api/v1/instance' })
    expect(instance.json().data.instance.uploads).toBeNull()

    const response = await bare.app.inject({
      method: 'POST',
      url: `/api/v1/channels/${channelId}/attachments`,
      headers: actor.headers,
      payload: { filename: 'a', size: 1 },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json().code).toBe('UPLOADS_DISABLED')
  })
})

describe('GET /api/v1/instance', () => {
  it('announces upload limits', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/instance' })
    expect(response.json().data.instance.uploads).toEqual({
      maxBytes: MAX_BYTES,
      maxAttachments: 10,
    })
  })
})
