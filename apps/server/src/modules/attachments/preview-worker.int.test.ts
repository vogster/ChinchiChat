import { sql } from 'drizzle-orm'
import sharp from 'sharp'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { sendFiles, uploadFile } from '../../../test/attachment-helpers'
import { createGuild, signUp } from '../../../test/guild-helpers'
import { testStorageConfig } from '../../../test/storage'
import { createTestApp, resetState } from '../../../test/test-app'
import { createObjectStorage } from '../../storage/object-storage'
import { PREVIEW_MAX_SIDE } from '../../storage/thumbnail'
import { createAttachmentRepository } from './attachment.repository'
import { PREVIEW_MAX_ATTEMPTS } from './preview-worker'

import type { TestActor } from '../../../test/guild-helpers'
import type { AttachmentRow } from './attachment.repository'
import type { PreviewWorker } from './preview-worker'

const { app, db, redis, events, close } = createTestApp()
const storage = createObjectStorage(testStorageConfig())
const repository = createAttachmentRepository(db)

let owner: TestActor
let textId: string
let png: Uint8Array

const worker = () => app.previews as PreviewWorker

const history = async () => {
  const response = await app.inject({
    method: 'GET',
    url: `/api/v1/channels/${textId}/messages`,
    headers: owner.headers,
  })
  return response.json().data.messages as {
    id: string
    attachments: {
      id: string
      width: number | null
      height: number | null
      previewUrl: string | null
    }[]
  }[]
}

const previewKey = (messageId: string, attachmentId: string) =>
  `attachments/${textId}/${messageId}/${attachmentId}.preview.webp`

beforeEach(async () => {
  await resetState(db, redis)
  events.clear()
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
  const guild = await createGuild(app, owner)
  textId = guild.channels.find((c) => c.type === 'text')?.id as string
  png = new Uint8Array(
    await sharp({ create: { width: 1200, height: 600, channels: 3, background: '#38f' } })
      .png()
      .toBuffer(),
  )
})

afterAll(async () => {
  await close()
})

describe('preview worker', () => {
  it('records the size, stores a WebP preview and announces it', async () => {
    const image = await uploadFile(app, owner, textId, png)
    const sent = await sendFiles(app, owner, textId, [image.id])
    expect(sent.attachments[0]).toMatchObject({ width: null, height: null, previewUrl: null })

    expect(await worker().runOnce()).toBe(1)

    const [attachment] = (await history()).at(-1)?.attachments ?? []
    expect(attachment).toMatchObject({
      width: 1200,
      height: 600,
      previewUrl: `/api/v1/attachments/${image.id}/preview/cat.webp`,
    })
    expect(events.published.at(-1)).toMatchObject({
      type: 'MESSAGE_UPDATE',
      data: { id: sent.id, attachments: [attachment] },
    })

    const redirect = await app.inject({
      method: 'GET',
      url: attachment?.previewUrl as string,
      headers: owner.headers,
    })
    expect(redirect.statusCode).toBe(302)
    const file = await fetch(redirect.headers.location as string)
    expect(file.headers.get('content-type')).toBe('image/webp')
    expect(file.headers.get('content-disposition')).toMatch(/^inline; filename="cat.webp"/)
    const meta = await sharp(new Uint8Array(await file.arrayBuffer())).metadata()
    expect(meta).toMatchObject({ format: 'webp', width: PREVIEW_MAX_SIDE, height: 400 })
  })

  it('ignores files that are not images and uploads that were never sent', async () => {
    const doc = await uploadFile(app, owner, textId, new TextEncoder().encode('hi'), {
      filename: 'a.txt',
      contentType: 'text/plain',
    })
    await sendFiles(app, owner, textId, [doc.id])
    await uploadFile(app, owner, textId, png)

    expect(await worker().runOnce()).toBe(0)
  })

  it('gives up on images it cannot decode after a few attempts', async () => {
    // Well-formed chunks (it passes the metadata scan), but the pixels are noise.
    const chunk = (type: string, data: number[]) => [
      ...[0, 0, 0, data.length],
      ...Buffer.from(type, 'latin1'),
      ...data,
      ...[0, 0, 0, 0],
    ]
    const broken = Uint8Array.from([
      ...png.subarray(0, 8),
      ...chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
      ...chunk('IDAT', new Array(40).fill(7)),
      ...chunk('IEND', []),
    ])
    const image = await uploadFile(app, owner, textId, broken)
    await sendFiles(app, owner, textId, [image.id])

    for (let attempt = 0; attempt < PREVIEW_MAX_ATTEMPTS; attempt += 1) {
      expect(await worker().runOnce()).toBe(1)
      await db.execute(sql`update attachments set preview_locked_until = null`)
    }
    expect(await worker().runOnce()).toBe(0)

    expect(await repository.findById(image.id)).toMatchObject({ previewState: 'failed' })
    const [attachment] = (await history()).at(-1)?.attachments ?? []
    expect(attachment).toMatchObject({ width: null, previewUrl: null })
  })

  it('fails images whose last attempt crashed the worker instead of keeping them queued', async () => {
    const image = await uploadFile(app, owner, textId, png)
    await sendFiles(app, owner, textId, [image.id])
    await db.execute(
      sql`update attachments set preview_attempts = ${PREVIEW_MAX_ATTEMPTS},
          preview_locked_until = now() - interval '1 second'`,
    )

    expect(await worker().runOnce()).toBe(0)
    expect(await repository.findById(image.id)).toMatchObject({ previewState: 'failed' })
  })

  it('ignores results of a worker whose lease was taken over', async () => {
    const image = await uploadFile(app, owner, textId, png)
    await sendFiles(app, owner, textId, [image.id])
    const claim = async (leaseMs: number) =>
      (await repository.claimPreviewJobs({ limit: 1, leaseMs, maxAttempts: 3 }))[0] as AttachmentRow
    const stale = await claim(0)
    const fresh = await claim(60_000)

    expect(await repository.failPreview(stale)).toBe(false)
    expect(await repository.completePreview(stale, { width: 1, height: 1 })).toBe(false)
    expect(await repository.completePreview(fresh, { width: 2, height: 3 })).toBe(true)
    expect(await repository.findById(image.id)).toMatchObject({ previewState: 'ready', width: 2 })
  })

  it('takes over jobs whose worker died, but not ones still being processed', async () => {
    const image = await uploadFile(app, owner, textId, png)
    await sendFiles(app, owner, textId, [image.id])
    await db.execute(sql`update attachments set preview_locked_until = now() + interval '1 minute'`)
    expect(await worker().runOnce()).toBe(0)

    await db.execute(sql`update attachments set preview_locked_until = now() - interval '1 second'`)
    expect(await worker().runOnce()).toBe(1)
  })

  it('removes the preview with the message', async () => {
    const image = await uploadFile(app, owner, textId, png)
    const sent = await sendFiles(app, owner, textId, [image.id])
    await worker().runOnce()
    expect(await storage.stat(previewKey(sent.id, image.id))).not.toBeNull()

    await app.inject({
      method: 'DELETE',
      url: `/api/v1/channels/${textId}/messages/${sent.id}`,
      headers: owner.headers,
    })
    expect(await storage.stat(previewKey(sent.id, image.id))).toBeNull()
  })

  it('processes in the background after a send', async () => {
    const image = await uploadFile(app, owner, textId, png)
    worker().start()
    try {
      await sendFiles(app, owner, textId, [image.id])
      await expect
        .poll(async () => (await repository.findById(image.id))?.previewState, { timeout: 10_000 })
        .toBe('ready')
    } finally {
      await worker().stop()
    }
  })
})
