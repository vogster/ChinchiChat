import sharp from 'sharp'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { sendFiles, uploadFile } from '../../../test/attachment-helpers'
import { createGuild, signUp } from '../../../test/guild-helpers'
import { testStorageConfig } from '../../../test/storage'
import { createTestApp, resetState } from '../../../test/test-app'
import { createObjectStorage } from '../../storage/object-storage'

import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, close } = createTestApp({ env: { RATE_LIMIT: 'off' } })
const storage = createObjectStorage(testStorageConfig())

let owner: TestActor
let textId: string

const has = (data: Uint8Array, text: string) => Buffer.from(data).includes(Buffer.from(text))

beforeEach(async () => {
  await resetState(db, redis)
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
  const guild = await createGuild(app, owner)
  textId = guild.channels.find((c) => c.type === 'text')?.id as string
})

afterAll(async () => {
  await close()
})

describe('sending a photo', () => {
  it('drops its camera and location data, keeping it upright', async () => {
    const photo = new Uint8Array(
      await sharp({ create: { width: 8, height: 4, channels: 3, background: '#123456' } })
        .withExif({ IFD0: { Make: 'SecretCam' }, IFD3: { GPSLatitudeRef: 'N' } })
        .withMetadata({ orientation: 6 })
        .jpeg()
        .toBuffer(),
    )
    const slot = await uploadFile(app, owner, textId, photo, {
      filename: 'me.jpg',
      contentType: 'image/jpeg',
    })

    const message = await sendFiles(app, owner, textId, [slot.id])

    const stored = await storage.read(`attachments/${textId}/${message.id}/${slot.id}`)
    expect(has(stored, 'SecretCam')).toBe(false)
    expect((await sharp(stored).metadata()).orientation).toBe(6)
    const sent = (message.attachments[0] as unknown as { size: number }).size
    expect(sent).toBe(stored.length)
    expect(sent).toBeLessThan(photo.length)
  })
})
