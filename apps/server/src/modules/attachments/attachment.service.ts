import {
  ATTACHMENTS_PER_MESSAGE_MAX,
  DEFAULT_CONTENT_TYPE,
  Permission,
  isInlineImage,
} from '@chinchi/shared'

import { HttpError, badRequest } from '../../http/http-error'
import { SNIFF_BYTES, detectImageType } from '@chinchi/shared'
import { attachmentKey, previewFilename, previewKey, uploadKey } from './attachment.mapper'
import { isMessageChannel } from '../channels/channel.repository'

import { createLimiter } from '../../http/limiter'
import { UnreadableImage, stripMetadata } from '../../storage/strip-metadata'
import type { ObjectStorage } from '../../storage/object-storage'
import type { ChannelService } from '../channels/channel.service'
import type { AttachmentRepository, AttachmentRow } from './attachment.repository'
import type { AttachmentUpload, Snowflake, UploadLimits } from '@chinchi/shared'
import type { FastifyBaseLogger } from 'fastify'

/** How long a presigned upload URL works. */
export const UPLOAD_URL_TTL_S = 15 * 60
/** How long an upload may wait for a message before it expires. */
export const PENDING_TTL_MS = 60 * 60 * 1000
/** Bigger images are not previewed: the worker reads the whole file into memory. */
export const PREVIEW_MAX_INPUT_BYTES = 40 * 1024 * 1024
/** Unsent uploads a user may hold at once, so nobody fills storage without sending. */
export const MAX_PENDING_UPLOADS = 20
/** Photos having their metadata removed at once (each is read whole into memory). */
const STRIP_CONCURRENCY = 4
/** Download URLs are signed per window, so they repeat (and cache) within it. */
export const DOWNLOAD_WINDOW_MS = 60 * 60 * 1000
const DOWNLOAD_URL_TTL_S = (2 * DOWNLOAD_WINDOW_MS) / 1000

export interface AttachmentServiceDeps {
  readonly attachments: AttachmentRepository
  readonly channels: ChannelService
  /** Absent when the instance has no object storage: uploads are disabled. */
  readonly storage: ObjectStorage | undefined
  readonly maxBytes: number
  readonly nextId: () => Snowflake
  readonly log: FastifyBaseLogger
  readonly now?: () => Date
}

export interface CreateUploadInput {
  readonly filename: string
  readonly size: number
  readonly contentType: string
}

const uploadsDisabled = () => badRequest('UPLOADS_DISABLED', 'File uploads are disabled')
const invalidAttachment = () =>
  badRequest('INVALID_ATTACHMENT', 'Attachment is missing, expired or invalid')
const unknownAttachment = () => new HttpError(404, 'UNKNOWN_ATTACHMENT', 'Unknown attachment')

export const createAttachmentService = ({
  attachments,
  channels,
  storage,
  maxBytes,
  nextId,
  log,
  now = () => new Date(),
}: AttachmentServiceDeps) => {
  const pendingSince = () => new Date(now().getTime() - PENDING_TTL_MS)
  const stripping = createLimiter(STRIP_CONCURRENCY)

  const requireStorage = () => {
    if (!storage) throw uploadsDisabled()
    return storage
  }

  /**
   * Freezes the upload under the message and checks the copy: size, and images are images.
   * Photos lose their metadata (camera, GPS) here, before anyone can download them.
   * Returns the row as sent (its size may shrink), or null if the file doesn't pass.
   */
  const freeze = async (
    store: ObjectStorage,
    row: AttachmentRow,
    messageId: Snowflake,
  ): Promise<AttachmentRow | null> => {
    const key = attachmentKey(row, messageId)
    if (!(await store.copy(uploadKey(row), key))) return null
    const stat = await store.stat(key)
    if (!stat || stat.size !== row.size) return null
    if (!isInlineImage(row.contentType)) return row
    if (detectImageType(await store.readStart(key, SNIFF_BYTES)) !== row.contentType) return null
    if (row.size > PREVIEW_MAX_INPUT_BYTES) return row
    // A whole photo in memory (a few copies of it): only a few at a time per process.
    let stripped: Uint8Array | null
    try {
      stripped = await stripping(async () => {
        const cleaned = stripMetadata(await store.read(key), row.contentType)
        if (cleaned) await store.put(key, cleaned, row.contentType)
        return cleaned
      })
    } catch (error) {
      // A photo we can't take apart might still carry a location: it isn't sent.
      if (error instanceof UnreadableImage) return null
      throw error
    }
    if (!stripped) return row
    // The row keeps the upload's size until the message exists: a failed send can retry.
    return { ...row, size: stripped.length }
  }

  const deleteQuietly = async (keys: readonly string[]) => {
    if (!storage || keys.length === 0) return
    try {
      await storage.delete(keys)
    } catch (error) {
      log.warn({ err: error }, 'Failed to delete attachment files')
    }
  }

  return {
    limits(): UploadLimits | null {
      return storage ? { maxBytes, maxAttachments: ATTACHMENTS_PER_MESSAGE_MAX } : null
    },

    async createUpload(
      channelId: Snowflake,
      userId: Snowflake,
      { filename, size, contentType }: CreateUploadInput,
    ): Promise<AttachmentUpload> {
      const store = requireStorage()
      const { channel } = await channels.resolve(
        channelId,
        userId,
        Permission.SendMessages | Permission.AttachFiles,
      )
      if (!isMessageChannel(channel.type)) {
        throw badRequest('INVALID_CHANNEL', 'Files can only be sent to text channels')
      }
      if (size > maxBytes) throw badRequest('FILE_TOO_LARGE', 'File is too large')
      if ((await attachments.countPending(userId, pendingSince())) >= MAX_PENDING_UPLOADS) {
        throw new HttpError(429, 'TOO_MANY_PENDING_UPLOADS', 'Too many unsent uploads')
      }

      const row = await attachments.insert({
        id: nextId(),
        channelId: channel.id,
        uploaderId: userId,
        filename,
        contentType,
        size,
        previewState:
          isInlineImage(contentType) && size <= PREVIEW_MAX_INPUT_BYTES ? 'pending' : 'none',
      })
      const { url, headers } = await store.presignPut(uploadKey(row), {
        contentType,
        size,
        expiresIn: UPLOAD_URL_TTL_S,
      })
      return {
        id: row.id,
        uploadUrl: url,
        method: 'PUT',
        headers,
        expiresAt: new Date(now().getTime() + UPLOAD_URL_TTL_S * 1000).toISOString(),
      }
    },

    /**
     * Copies the author's uploads under the new message and verifies the copies, so what was
     * checked is exactly what gets served. The message insert then claims the rows atomically;
     * if it fails, `discard` the copies. Each attempt has its own message id, so concurrent
     * sends of one upload never touch each other's copies.
     */
    async prepare(
      channelId: Snowflake,
      uploaderId: Snowflake,
      ids: readonly Snowflake[],
      messageId: Snowflake,
    ): Promise<AttachmentRow[]> {
      if (ids.length === 0) return []
      const store = requireStorage()
      const rows = await attachments.findPending({
        ids,
        uploaderId,
        channelId,
        createdAfter: pendingSince(),
      })
      if (rows.length !== ids.length) throw invalidAttachment()
      // Settle every copy first: a storage error must not leave the others behind.
      const results = await Promise.allSettled(rows.map((row) => freeze(store, row, messageId)))
      const frozen = results.flatMap((result) =>
        result.status === 'fulfilled' && result.value ? [result.value] : [],
      )
      if (frozen.length !== rows.length) {
        await deleteQuietly(rows.map((row) => attachmentKey(row, messageId)))
        const failure = results.find((result) => result.status === 'rejected')
        throw failure ? failure.reason : invalidAttachment()
      }
      // Keep the order the author chose.
      return ids.map((id) => frozen.find((row) => row.id === id) as AttachmentRow)
    },

    /** Drops the copies made by `prepare` when the message was not created. */
    discard: (rows: readonly AttachmentRow[], messageId: Snowflake) =>
      deleteQuietly(rows.map((row) => attachmentKey(row, messageId))),

    /** After a successful send: rows take the sent size, uploads are no longer needed. */
    async releaseUploads(rows: readonly AttachmentRow[]): Promise<void> {
      await Promise.all(rows.map((row) => attachments.setSize(row.id, row.size)))
      await deleteQuietly(rows.map(uploadKey))
    },

    /** A presigned download (of the file or its preview) for someone who can read the channel. */
    async download(
      attachmentId: Snowflake,
      userId: Snowflake,
      variant: 'original' | 'preview' = 'original',
    ): Promise<{ url: string; maxAgeS: number }> {
      const store = requireStorage()
      const row = await attachments.findById(attachmentId)
      const messageId = row?.messageId
      if (!row || !messageId) throw unknownAttachment()
      if (variant === 'preview' && row.previewState !== 'ready') throw unknownAttachment()
      try {
        await channels.resolve(row.channelId, userId, Permission.ReadMessageHistory)
      } catch (error) {
        if (error instanceof HttpError) throw unknownAttachment()
        throw error
      }

      const nowMs = now().getTime()
      const windowStart = nowMs - (nowMs % DOWNLOAD_WINDOW_MS)
      const signing = { expiresIn: DOWNLOAD_URL_TTL_S, signedAt: new Date(windowStart) }
      const url =
        variant === 'preview'
          ? await store.presignGet(previewKey(row, messageId), {
              filename: previewFilename(row.filename),
              contentType: 'image/webp',
              inline: true,
              ...signing,
            })
          : await store.presignGet(attachmentKey(row, messageId), {
              filename: row.filename,
              // Anything but a safe image is opaque bytes: never loadable as a script or
              // stylesheet, even if storage ends up on the app's own origin.
              contentType: isInlineImage(row.contentType) ? row.contentType : DEFAULT_CONTENT_TYPE,
              inline: isInlineImage(row.contentType),
              ...signing,
            })
      // Cache at most until the end of the window: the URL is valid for another one after it.
      const maxAgeS = Math.floor((windowStart + DOWNLOAD_WINDOW_MS - nowMs) / 1000)
      return { url, maxAgeS }
    },

    /** Best effort: a leftover object only costs space and is never served without a row. */
    removeFiles: (rows: readonly AttachmentRow[], messageId: Snowflake) =>
      deleteQuietly(
        rows.flatMap((row) => [
          attachmentKey(row, messageId),
          ...(row.previewState === 'none' ? [] : [previewKey(row, messageId)]),
        ]),
      ),
  }
}

export type AttachmentService = ReturnType<typeof createAttachmentService>
