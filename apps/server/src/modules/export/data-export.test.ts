import { PassThrough, Readable } from 'node:stream'
import { buffer } from 'node:stream/consumers'
import { describe, expect, it } from 'vitest'

import { readZip } from '../../../test/zip'
import { createDataExport } from './data-export'

import type { ObjectStorage } from '../../storage/object-storage'
import type { UserRow } from '../users/user.repository'
import type { DataExportDeps } from './data-export'

const user = {
  id: '100',
  username: 'anna',
  displayName: null,
  avatarId: null,
  bannerId: null,
  email: 'anna@example.com',
  emailVerifiedAt: null,
  dmPolicy: 'servers',
  locale: 'ru',
  bio: null,
  totpSecret: null,
  isAdmin: false,
  isBot: false,
  accentColor: null,
  createdAt: new Date('2026-10-01T00:00:00Z'),
} as unknown as UserRow

const message = {
  id: '106562751601573888',
  editedAt: null,
  guildId: null,
  guildName: null,
  channelId: '200',
  channelName: null,
  channelType: 'dm',
  content: '',
}

/** One message of Anna's with the given attachments, and storage that serves `files` by key. */
const exportWith = (
  attachments: { id: string; filename: string }[],
  objects: (key: string) => Promise<Readable>,
  maxConcurrent?: number,
) => {
  let served = false
  const deps: DataExportDeps = {
    exports: {
      messagesBy: async () => {
        if (served) return []
        served = true
        return [message]
      },
      memberships: async () => [],
    } as unknown as DataExportDeps['exports'],
    attachments: {
      listByMessages: async () =>
        attachments.map((a) => ({ ...a, messageId: message.id, channelId: '200' })),
    } as unknown as DataExportDeps['attachments'],
    relationships: { list: async () => [] },
    // Only the stream: a whole file in memory is what this export must not do.
    storage: { readStream: objects } as unknown as ObjectStorage,
    log: { error: () => undefined } as unknown as DataExportDeps['log'],
    ...(maxConcurrent === undefined ? {} : { maxConcurrent }),
  }
  return createDataExport(deps)
}

describe('data export', () => {
  it('streams the files into the archive and leaves out the ones storage lost', async () => {
    const bytes = Buffer.alloc(300_000, 7)
    const dataExport = exportWith(
      [
        { id: '1', filename: 'big.bin' },
        { id: '2', filename: 'gone.bin' },
      ],
      async (key) => {
        if (key.endsWith('/2')) throw new Error('NoSuchKey')
        return Readable.from([bytes.subarray(0, 100_000), bytes.subarray(100_000)])
      },
    )

    const files = readZip(await buffer(dataExport.build(user)))

    expect(files.get(`files/${message.id}/1-big.bin`)).toEqual(bytes)
    expect(files.has(`files/${message.id}/2-gone.bin`)).toBe(false)
  })

  it('runs only so many at once: the next one is told the server is busy', async () => {
    const stalled = new PassThrough()
    let opened = (): void => undefined
    const reading = new Promise<void>((resolve) => {
      opened = resolve
    })
    const dataExport = exportWith(
      [{ id: '1', filename: 'slow.bin' }],
      async () => {
        opened()
        return stalled
      },
      1,
    )

    const first = dataExport.build(user)
    first.resume()
    await reading
    expect(() => dataExport.build(user)).toThrow(expect.objectContaining({ code: 'SERVER_BUSY' }))

    // The download is dropped halfway: the place is free again, the file stream closed.
    first.destroy()
    await new Promise((resolve) => setImmediate(resolve))
    expect(stalled.destroyed).toBe(true)
    expect(() => dataExport.build(user).destroy()).not.toThrow()
  })
})
