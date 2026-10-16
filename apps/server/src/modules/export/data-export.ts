import { Readable } from 'node:stream'
import { decodeSnowflake } from '@chinchi/shared'
import { ZipArchive } from 'archiver'

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
}

const PAGE = 500

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
 * people's) and their files. It streams: messages are read page by page and files one at a time,
 * so a large account does not sit in memory.
 */
export const createDataExport = ({
  exports,
  attachments,
  relationships,
  storage,
  log,
  now = () => new Date(),
}: DataExportDeps) => {
  /** Appends one entry and waits until the archive has taken it in. */
  const add = (archive: Archiver, source: Buffer | string | Readable, name: string) =>
    new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => reject(error)
      archive.once('error', onError)
      archive.once('entry', () => {
        archive.off('error', onError)
        resolve()
      })
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
      // A file already gone from storage is left out rather than failing the export.
      const bytes = await storage.read(file.key).catch(() => null)
      if (bytes) await add(archive, Buffer.from(bytes), file.path)
    }
  }

  return {
    /** The archive as a stream; it ends when everything is in (or aborts on failure). */
    build(user: UserRow): Archiver {
      const archive = new ZipArchive({ zlib: { level: 6 } })
      fill(user, archive)
        .then(() => archive.finalize())
        .catch((error: unknown) => {
          log.error({ err: error, userId: user.id }, 'Data export failed')
          archive.abort()
        })
      return archive
    },
  }
}

export type DataExport = ReturnType<typeof createDataExport>
