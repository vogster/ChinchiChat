import { finished, Readable } from 'node:stream'
import { decodeSnowflake } from '@chinchi/shared'
import { ZipArchive } from 'archiver'

import { HttpError } from '../../http/http-error'
import { attachmentKey } from '../attachments/attachment.mapper'
import { profileImageKey } from '../media/media-paths'
import { toCurrentUser, toPublicUser } from '../users/user.mapper'

import type { ObjectStorage } from '../../storage/object-storage'
import type { AttachmentRepository } from '../attachments/attachment.repository'
import type { RelationshipRepository } from '../relationships/relationship.repository'
import type { UserRow } from '../users/user.repository'
import type { ExportedMessageRow, ExportRepository } from './export.repository'
import type { Archiver } from 'archiver'
import type { FastifyBaseLogger } from 'fastify'

export interface DataExportDeps {
  readonly exports: ExportRepository
  readonly attachments: Pick<AttachmentRepository, 'listByMessages'>
  readonly relationships: Pick<RelationshipRepository, 'list'>
  readonly storage: ObjectStorage | undefined
  readonly log: FastifyBaseLogger
  readonly now?: () => Date
  /** Exports running at once in this process; the next one gets 503 `SERVER_BUSY`. */
  readonly maxConcurrent?: number
}

const PAGE = 500
const MAX_CONCURRENT_EXPORTS = 2

const README = `Chinchi data export / Экспорт данных Chinchi

account.json    your account, servers and friends / учётная запись, серверы и друзья
messages.jsonl  every message you wrote, one JSON object per line / все ваши сообщения, по одному JSON на строку
files/          files attached to your messages / файлы из ваших сообщений
profile/        your avatar and banner / аватар и баннер
`

/** A file name safe inside an archive (no folders, no control characters). */
const safeName = (name: string) => name.replace(/[\\/:*?"<>|\p{Cc}]/gu, '_').slice(0, 120) || 'file'

interface PendingFile {
  readonly key: string
  readonly path: string
}

/**
 * Builds a ZIP of everything a user put into Chinchi: the account, their own messages (not other
 * people's) and their files. It streams: messages are read page by page, and files go from
 * storage into the archive as streams, at the pace the client downloads, so neither a large
 * account nor a large file sits in memory. Only a few exports run at once.
 */
export const createDataExport = ({
  exports,
  attachments,
  relationships,
  storage,
  log,
  now = () => new Date(),
  maxConcurrent = MAX_CONCURRENT_EXPORTS,
}: DataExportDeps) => {
  let running = 0

  /** Appends one entry and waits until the archive has taken it in (or is gone). */
  const add = (archive: Archiver, source: Buffer | string | Readable, name: string) =>
    new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => settle(() => reject(error))
      const onClose = () => settle(() => reject(new Error('The export was dropped')))
      const onEntry = () => settle(resolve)
      const settle = (done: () => void) => {
        archive.off('error', onError)
        archive.off('close', onClose)
        archive.off('entry', onEntry)
        done()
      }
      archive.once('error', onError)
      archive.once('close', onClose)
      archive.once('entry', onEntry)
      archive.append(source, { name })
    })

  const messageLines = (user: UserRow, files: PendingFile[]) =>
    async function* () {
      let after: string | null = null
      for (;;) {
        const page: ExportedMessageRow[] = await exports.messagesBy(user.id, after, PAGE)
        if (page.length === 0) return
        const rows = await attachments.listByMessages(page.map((m) => m.id))
        for (const message of page) {
          const own = rows.filter((row) => row.messageId === message.id)
          const listed = own.map((row) => {
            const path = `files/${message.id}/${row.id}-${safeName(row.filename)}`
            files.push({ key: attachmentKey(row, message.id), path })
            return { id: row.id, filename: row.filename, path }
          })
          yield `${JSON.stringify({
            id: message.id,
            createdAt: new Date(decodeSnowflake(message.id).timestamp).toISOString(),
            editedAt: message.editedAt?.toISOString() ?? null,
            server: message.guildId ? { id: message.guildId, name: message.guildName } : null,
            channel: {
              id: message.channelId,
              name: message.channelName,
              type: message.channelType,
            },
            content: message.content,
            attachments: listed,
          })}\n`
        }
        after = page.at(-1)?.id ?? null
      }
    }

  const fill = async (user: UserRow, archive: Archiver) => {
    await add(archive, README, 'README.txt')
    const [servers, friends] = await Promise.all([
      exports.memberships(user.id),
      relationships.list(user.id),
    ])
    const account = {
      exportedAt: now().toISOString(),
      user: toCurrentUser(user),
      servers: servers.map((s) => ({ ...s, joinedAt: s.joinedAt.toISOString() })),
      relationships: friends.map(({ relationship, user: other }) => ({
        user: toPublicUser(other),
        type: relationship.type,
        since: relationship.createdAt.toISOString(),
      })),
    }
    await add(archive, JSON.stringify(account, null, 2), 'account.json')

    const files: PendingFile[] = []
    await add(archive, Readable.from(messageLines(user, files)()), 'messages.jsonl')
    if (!storage) return

    const profile = [
      ...(user.avatarId
        ? [{ key: profileImageKey('avatars', user.id, user.avatarId), path: 'profile/avatar.webp' }]
        : []),
      ...(user.bannerId
        ? [{ key: profileImageKey('banners', user.id, user.bannerId), path: 'profile/banner.webp' }]
        : []),
    ]
    for (const file of [...files, ...profile]) {
      if (archive.destroyed) return
      // A file already gone from storage is left out rather than failing the export.
      const stream = await storage.readStream(file.key).catch(() => null)
      if (!stream) continue
      // A dropped download must not leave the storage connection open.
      const close = () => stream.destroy()
      archive.once('close', close)
      try {
        await add(archive, stream, file.path)
      } finally {
        archive.off('close', close)
      }
    }
  }

  return {
    /**
     * The archive as a stream; it ends when everything is in (or aborts on failure). Throws 503
     * `SERVER_BUSY` while as many exports as allowed are running.
     */
    build(user: UserRow): Archiver {
      if (running >= maxConcurrent) {
        throw new HttpError(503, 'SERVER_BUSY', 'The server is busy, try again shortly')
      }
      running += 1
      const archive = new ZipArchive({ zlib: { level: 6 } })
      // Done, failed or dropped by the client: the place is free again.
      finished(archive, () => {
        running -= 1
      })
      fill(user, archive)
        .then(() => archive.finalize())
        .catch((error: unknown) => {
          if (archive.destroyed) return
          log.error({ err: error, userId: user.id }, 'Data export failed')
          archive.abort()
        })
      return archive
    },
  }
}

export type DataExport = ReturnType<typeof createDataExport>
