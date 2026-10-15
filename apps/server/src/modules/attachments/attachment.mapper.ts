import type { AttachmentRow } from './attachment.repository'
import type { Attachment, Snowflake } from '@chinchi/shared'

type KeyParts = Pick<AttachmentRow, 'id' | 'channelId'>

/** Where the client uploads: writable through the presigned URL until it expires. */
export const uploadKey = (row: KeyParts) => `uploads/${row.channelId}/${row.id}`

/**
 * Where a sent file lives: a copy made when the message is sent, out of reach of the upload
 * URL. The channel and message prefixes let their files be found by listing.
 */
export const attachmentKey = (row: KeyParts, messageId: Snowflake) =>
  `attachments/${row.channelId}/${messageId}/${row.id}`

/** The WebP preview stored next to the sent file. */
export const previewKey = (row: KeyParts, messageId: Snowflake) =>
  `${attachmentKey(row, messageId)}.preview.webp`

/** `cat.png` → `cat.webp`: the name a downloaded preview gets. */
export const previewFilename = (filename: string) => `${filename.replace(/\.[^.]*$/, '')}.webp`

export const toAttachment = (row: AttachmentRow): Attachment => ({
  id: row.id,
  filename: row.filename,
  size: row.size,
  contentType: row.contentType,
  url: `/api/v1/attachments/${row.id}/${encodeURIComponent(row.filename)}`,
  width: row.width,
  height: row.height,
  previewUrl:
    row.previewState === 'ready'
      ? `/api/v1/attachments/${row.id}/preview/${encodeURIComponent(previewFilename(row.filename))}`
      : null,
})

/** Groups attachments by message id. */
export const groupByMessage = (rows: readonly AttachmentRow[]) => {
  const groups = new Map<Snowflake, Attachment[]>()
  for (const row of rows) {
    if (!row.messageId) continue
    groups.set(row.messageId, [...(groups.get(row.messageId) ?? []), toAttachment(row)])
  }
  return groups
}
