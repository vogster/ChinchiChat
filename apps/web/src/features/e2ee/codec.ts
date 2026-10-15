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
  name: z.string(),
  type: z.string(),
  size: z.number().int().nonnegative(),
  key: z.string().min(1),
  iv: z.string().min(1),
})

const payloadSchema = z.object({
  v: z.literal(1),
  text: z.string(),
  files: z.array(encryptedFileSchema).optional(),
})

/** One file of an encrypted message: its attachment and what opens it. */
export type EncryptedFile = z.infer<typeof encryptedFileSchema>

/** An encrypted file as shown: its secret and the attachment URL of its ciphertext. */
export type SealedFile = EncryptedFile & { readonly url: string }

/** What an encrypted message carries inside MLS. Versioned, so it can grow. */
export type EncryptedPayload = z.infer<typeof payloadSchema>

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export const encodePayload = (payload: EncryptedPayload): Uint8Array =>
  encoder.encode(JSON.stringify(payload))

/** Null for anything that is not a payload this version understands. */
export const decodePayload = (bytes: Uint8Array): EncryptedPayload | null => {
  try {
    const parsed = payloadSchema.safeParse(JSON.parse(decoder.decode(bytes)))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
