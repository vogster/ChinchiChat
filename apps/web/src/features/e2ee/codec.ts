import { safeFileName } from '@chinchi/shared'
import { z } from 'zod'

export const toBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export const fromBase64 = (text: string): Uint8Array =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0))

const encryptedFileSchema = z.object({
  /** The attachment holding the ciphertext. */
  id: z.string().min(1),
  /** From the sender, unseen by the server: only ever a plain name, never a path. */
  name: z
    .string()
    .max(1024)
    .transform((name) => safeFileName(name)),
  type: z.string(),
  size: z.number().int().nonnegative(),
  key: z.string().min(1),
  iv: z.string().min(1),
})

const payloadSchema = z.object({
  v: z.literal(1),
  text: z.string(),
  files: z.array(encryptedFileSchema).optional(),
  /** A person's whole set of reactions to a message (a reaction, not a message). */
  react: z.array(z.string().max(64)).max(20).optional(),
  /** History backups only: the reactions to this message as this device read them. */
  reactionSets: z
    .array(
      z.object({
        userId: z.string().min(1),
        version: z.string().min(1),
        emojis: z.array(z.string().max(64)).max(20),
      }),
    )
    .max(100)
    .optional(),
})

/** One file of an encrypted message: its attachment and what opens it. */
export type EncryptedFile = z.infer<typeof encryptedFileSchema>

/** An encrypted file as shown: its secret and the attachment URL of its ciphertext. */
export type SealedFile = EncryptedFile & { readonly url: string }

/** What an encrypted message carries inside MLS. Versioned, so it can grow. */
export type EncryptedPayload = z.infer<typeof payloadSchema>

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** Ciphertext lengths are rounded up to this, so the server learns little from a message's size. */
export const PAYLOAD_BLOCK_BYTES = 256
/** The padding travels as a JSON member the schema ignores: `,"p":"<spaces>"`. */
const PADDING_OVERHEAD = ',"p":""'.length

/** JSON of the payload, padded with a spaces-only member to a whole number of blocks. */
export const encodePayload = (payload: EncryptedPayload): Uint8Array => {
  const json = JSON.stringify(payload)
  const bare = encoder.encode(json).byteLength + PADDING_OVERHEAD
  const target = Math.ceil(bare / PAYLOAD_BLOCK_BYTES) * PAYLOAD_BLOCK_BYTES
  const padding = ' '.repeat(target - bare)
  return encoder.encode(`${json.slice(0, -1)},"p":"${padding}"}`)
}

/** Null for anything that is not a payload this version understands. */
export const decodePayload = (bytes: Uint8Array): EncryptedPayload | null => {
  try {
    const parsed = payloadSchema.safeParse(JSON.parse(decoder.decode(bytes)))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
