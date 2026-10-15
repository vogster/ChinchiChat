import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { sendFiles, uploadFile } from '../../test/attachment-helpers'
import { createGuild, signUp } from '../../test/guild-helpers'
import { testStorageConfig } from '../../test/storage'
import { createTestApp, resetState } from '../../test/test-app'
import { attachments, interactions } from '../db/schema'
import { createObjectStorage } from '../storage/object-storage'
import { createStorageCleanup } from './storage-cleanup'

import type { TestActor } from '../../test/guild-helpers'

const { app, db, redis, close } = createTestApp({ env: { RATE_LIMIT: 'off' } })
const storage = createObjectStorage(testStorageConfig())
/** A valid 1×1 PNG: it passes the signature check and its metadata scan. */
const PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
    'base64',
  ),
)
const LATER = 3 * 60 * 60 * 1000

let owner: TestActor
let textId: string
let guildId: string

/** A cleanup run as if hours had passed since everything was uploaded. */
const cleanupLater = () =>
  createStorageCleanup({ db, storage, redis, now: () => new Date(Date.now() + LATER) }).run()

const exists = async (prefix: string) => (await storage.list(prefix)).objects.length > 0

beforeEach(async () => {
  await resetState(db, redis)
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
  const guild = await createGuild(app, owner)
  textId = guild.channels.find((c) => c.type === 'text')?.id as string
  guildId = guild.id
})

afterAll(async () => {
  await close()
})

describe('storage cleanup', () => {
  it('removes the files of deleted messages and keeps those still in use', async () => {
    const kept = await uploadFile(app, owner, textId, PNG)
    const keptMessage = await sendFiles(app, owner, textId, [kept.id])
    const gone = await uploadFile(app, owner, textId, PNG)
    const goneMessage = await sendFiles(app, owner, textId, [gone.id])
    await app.inject({
      method: 'DELETE',
      url: `/api/v1/channels/${textId}/messages/${goneMessage.id}`,
      headers: owner.headers,
    })

    await cleanupLater()

    expect(await exists(`attachments/${textId}/${goneMessage.id}/`)).toBe(false)
    expect(await exists(`attachments/${textId}/${keptMessage.id}/${kept.id}`)).toBe(true)
  })

  it('removes uploads that were never sent, rows and files', async () => {
    const abandoned = await uploadFile(app, owner, textId, PNG)

    // Fresh uploads stay: the user may still be typing.
    await createStorageCleanup({ db, storage, redis }).run()
    expect(await exists(`uploads/${textId}/${abandoned.id}`)).toBe(true)

    await cleanupLater()

    expect(await exists(`uploads/${textId}/${abandoned.id}`)).toBe(false)
    expect(await db.select().from(attachments).where(eq(attachments.id, abandoned.id))).toEqual([])
  })

  it("drops bots' interactions long after they expired", async () => {
    await db.insert(interactions).values({
      id: '1',
      tokenHash: 'x'.repeat(64),
      botId: owner.id,
      commandName: 'roll',
      guildId,
      channelId: textId,
      userId: owner.id,
      expiresAt: new Date(),
    })

    await cleanupLater()

    expect(await db.select().from(interactions)).toEqual([])
  })
})
