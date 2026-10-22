import { z } from 'zod'

import { snowflakeSchema } from '../snowflake/snowflake'

export const ATTACHMENTS_PER_MESSAGE_MAX = 10
export const FILENAME_MAX_LENGTH = 255
export const DEFAULT_CONTENT_TYPE = 'application/octet-stream'

/** Raster formats browsers render without running anything (no SVG: it can carry scripts). */
export const INLINE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const
export type InlineImageType = (typeof INLINE_IMAGE_TYPES)[number]

export const isInlineImage = (contentType: string): contentType is InlineImageType =>
  (INLINE_IMAGE_TYPES as readonly string[]).includes(contentType)

/** Containers of voice messages, which `<audio>` plays (checked by their bytes, as images). */
export const INLINE_AUDIO_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4'] as const
export type InlineAudioType = (typeof INLINE_AUDIO_TYPES)[number]

export const isInlineAudio = (contentType: string): contentType is InlineAudioType =>
  (INLINE_AUDIO_TYPES as readonly string[]).includes(contentType)

/**
 * Control and format characters. The latter include right-to-left overrides, which show
 * "invoice\u202Efdp.exe" as "invoiceexe.pdf".
 */
const INVISIBLE = /[\p{Cc}\p{Cf}]/gu

/** The last path segment, without invisible characters or the spaces around it. */
const lastSegment = (value: string) =>
  (value.replace(INVISIBLE, '').split(/[/\\]/).pop() ?? '').trim()

/** The last path segment without invisible characters: paths from the client are never trusted. */
export const attachmentFilenameSchema = z
  .string()
  .max(1024)
  .transform(lastSegment)
  .pipe(z.string().min(1).max(FILENAME_MAX_LENGTH))

/** What Windows refuses in a file name, and the device names it won't create a file under. */
const RESERVED_CHARS = /[<>:"|?*]/g
const DEVICE_NAMES = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i
const EXTENSION_MAX_LENGTH = 16

/** Cut to the length limit, keeping a short extension. */
const shorten = (name: string) => {
  if (name.length <= FILENAME_MAX_LENGTH) return name
  const dot = name.lastIndexOf('.')
  const extension = dot > 0 && name.length - dot <= EXTENSION_MAX_LENGTH ? name.slice(dot) : ''
  return name.slice(0, FILENAME_MAX_LENGTH - extension.length) + extension
}

/**
 * A name to save a file under on any system, for names nobody checked (an encrypted file's comes
 * from its sender, the server never sees it): the last path segment, without invisible
 * characters, with what Windows refuses replaced and no trailing dots or spaces; a device name
 * gets a prefix. Nothing usable left: `fallback`.
 */
export const safeFileName = (name: string, fallback = 'file'): string => {
  const cleaned = lastSegment(name)
    .replace(RESERVED_CHARS, '_')
    .replace(/[. ]+$/, '')
  if (cleaned === '') return fallback
  return shorten(DEVICE_NAMES.test(cleaned) ? `_${cleaned}` : cleaned)
}

const TOKEN = "[a-z0-9][a-z0-9!#$&^_.+'-]*"

/** A bare `type/subtype` (no parameters), stored lowercase. */
export const contentTypeSchema = z
  .string()
  .max(127)
  .transform((value) => value.toLowerCase())
  .pipe(z.string().regex(new RegExp(`^${TOKEN}/${TOKEN}$`)))

export const createAttachmentRequestSchema = z.strictObject({
  filename: attachmentFilenameSchema,
  /** Exact size in bytes; the instance limit is checked by the server. */
  size: z.number().int().positive(),
  contentType: contentTypeSchema.default(DEFAULT_CONTENT_TYPE),
})

/** Where and how to upload the file: a short-lived presigned request straight to storage. */
export const attachmentUploadSchema = z.object({
  id: snowflakeSchema,
  uploadUrl: z.url(),
  method: z.literal('PUT'),
  /** Must be sent exactly as given: they are part of the signature. */
  headers: z.record(z.string(), z.string()),
  expiresAt: z.iso.datetime(),
})

export const attachmentSchema = z.object({
  id: snowflakeSchema,
  filename: z.string(),
  size: z.number().int(),
  contentType: z.string(),
  /** API path (relative to the API origin) that redirects to the file for allowed viewers. */
  url: z.string(),
  /** Pixel size of images once processed (after EXIF orientation); null otherwise. */
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  /** Small WebP preview of an image, once generated; show it in the feed, open `url` on click. */
  previewUrl: z.string().nullable(),
})

export type CreateAttachmentRequest = z.input<typeof createAttachmentRequestSchema>
export type AttachmentUpload = z.infer<typeof attachmentUploadSchema>
export type Attachment = z.infer<typeof attachmentSchema>
