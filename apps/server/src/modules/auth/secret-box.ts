import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * Encrypts secrets that must stay usable by the server (TOTP secrets: the server computes codes
 * from them, so unlike passwords they cannot be hashed). AES-256-GCM under SECRETS_KEY, a key
 * that lives in the environment, not in the database: a copy of the database alone no longer
 * yields second factors. Values are stored as `enc1:<iv>:<ciphertext+tag>` (base64url).
 */
export interface SecretBox {
  /** Whether a key is configured; without one, `seal` stores plaintext (as before). */
  readonly enabled: boolean
  seal(plain: string): string
  /** The secret; plaintext values from before a key existed are returned as they are. */
  open(stored: string): string
}

const PREFIX = 'enc1'
const IV_BYTES = 12
const TAG_BYTES = 16
export const SECRETS_KEY_BYTES = 32

export const isSealed = (stored: string): boolean => stored.startsWith(`${PREFIX}:`)

export const createSecretBox = (key: Uint8Array | undefined): SecretBox => {
  if (key && key.byteLength !== SECRETS_KEY_BYTES) {
    throw new Error(`SECRETS_KEY must be ${SECRETS_KEY_BYTES} bytes`)
  }
  return {
    enabled: key !== undefined,

    seal(plain) {
      if (!key) return plain
      const iv = randomBytes(IV_BYTES)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      const body = Buffer.concat([
        cipher.update(plain, 'utf8'),
        cipher.final(),
        cipher.getAuthTag(),
      ])
      return `${PREFIX}:${iv.toString('base64url')}:${body.toString('base64url')}`
    },

    open(stored) {
      if (!isSealed(stored)) return stored
      if (!key) throw new Error('SECRETS_KEY is not set, but the database holds encrypted secrets')
      const [, iv, body] = stored.split(':') as [string, string, string]
      const bytes = Buffer.from(body, 'base64url')
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
      decipher.setAuthTag(bytes.subarray(bytes.length - TAG_BYTES))
      return Buffer.concat([
        decipher.update(bytes.subarray(0, bytes.length - TAG_BYTES)),
        decipher.final(),
      ]).toString('utf8')
    },
  }
}
