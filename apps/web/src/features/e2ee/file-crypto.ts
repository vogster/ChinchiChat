import { fromBase64, toBase64 } from './codec'

/**
 * What it takes to open one file of an encrypted message: travels inside the MLS message,
 * never to the server, which only stores the ciphertext under a generic name.
 */
export interface FileSecret {
  readonly name: string
  /** As the sender's browser saw it; shown inline only if the bytes say it is an image. */
  readonly type: string
  /** Of the plain file, for display. */
  readonly size: number
  /** AES-256-GCM key, base64; a fresh one for every file. */
  readonly key: string
  /** 12-byte nonce, base64. */
  readonly iv: string
}

const ALGORITHM = 'AES-GCM'
const IV_BYTES = 12
/** AES-GCM appends a 16-byte authentication tag. */
const TAG_BYTES = 16

/** How big the ciphertext of a plain file of `size` bytes is. */
export const sealedSize = (size: number) => size + TAG_BYTES

/** Copies into a buffer of its own, as WebCrypto wants (not a view into something shared). */
const own = (bytes: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(bytes)

/** Encrypts a file for upload; the secret goes into the message. */
export const encryptFile = async (file: File): Promise<{ blob: Blob; file: FileSecret }> => {
  const key = await crypto.subtle.generateKey({ name: ALGORITHM, length: 256 }, true, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const plain = await file.arrayBuffer()
  const ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, plain)
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key))
  return {
    blob: new Blob([ciphertext], { type: 'application/octet-stream' }),
    file: {
      name: file.name,
      type: file.type,
      size: file.size,
      key: toBase64(raw),
      iv: toBase64(iv),
    },
  }
}

/** The plain bytes; rejects when the ciphertext was changed or the key does not fit. */
export const decryptFile = async (
  ciphertext: Uint8Array,
  { key, iv }: Pick<FileSecret, 'key' | 'iv'>,
): Promise<Uint8Array> => {
  const imported = await crypto.subtle.importKey('raw', own(fromBase64(key)), ALGORITHM, false, [
    'decrypt',
  ])
  const plain = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: own(fromBase64(iv)) },
    imported,
    own(ciphertext),
  )
  return new Uint8Array(plain)
}
