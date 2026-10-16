import { decodePayload, encodePayload, fromBase64, toBase64 } from './codec'

import type { EncryptedPayload } from './codec'
import type { StoredUserKey } from './cross-signing'

/**
 * The recovery key: 256 random bits the user keeps somewhere safe. It opens the history backup
 * and the user key stored next to it, so a new device without any old one gets both back.
 */
const KEY_BYTES = 32
/** Crockford base32: no I, L, O or U, so it reads and types without mix-ups. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const KEY_CHARS = Math.ceil((KEY_BYTES * 8) / 5)
const GROUP = 4
const IV_BYTES = 12

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export const generateRecoveryKey = (): Uint8Array =>
  crypto.getRandomValues(new Uint8Array(KEY_BYTES))

export const formatRecoveryKey = (key: Uint8Array): string => {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of key) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out.match(new RegExp(`.{1,${GROUP}}`, 'g'))?.join('-') ?? out
}

/** The key the user typed, or null if it can't be one (wrong length or characters). */
export const parseRecoveryKey = (text: string): Uint8Array | null => {
  const chars = text.toUpperCase().replace(/[\s-]/g, '').replaceAll('O', '0').replace(/[IL]/g, '1')
  if (chars.length !== KEY_CHARS) return null
  const out = new Uint8Array(KEY_BYTES)
  let bits = 0
  let value = 0
  let index = 0
  for (const char of chars) {
    const digit = ALPHABET.indexOf(char)
    if (digit < 0) return null
    value = ((value << 5) | digit) & 0xffff
    bits += 5
    if (bits >= 8) {
      if (index < KEY_BYTES) out[index] = (value >>> (bits - 8)) & 0xff
      index += 1
      bits -= 8
    }
  }
  // The padding bits of the last character are always zero in a key we made.
  return (value & ((1 << bits) - 1)) === 0 ? out : null
}

export interface RecoveryKeys {
  /** Encrypts the history backup. */
  readonly backup: CryptoKey
  /** Encrypts the user key kept with the backup. */
  readonly userKey: CryptoKey
}

const derive = (base: CryptoKey, info: string) =>
  crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: encoder.encode(info) },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )

export const deriveRecoveryKeys = async (key: Uint8Array): Promise<RecoveryKeys> => {
  const base = await crypto.subtle.importKey('raw', new Uint8Array(key), 'HKDF', false, [
    'deriveKey',
  ])
  const [backup, userKey] = await Promise.all([
    derive(base, 'chinchi-backup-v1'),
    derive(base, 'chinchi-user-key-v1'),
  ])
  return { backup, userKey }
}

/** AES-GCM with a fresh nonce; the label binds the ciphertext to what it is for. */
const seal = async (key: CryptoKey, label: string, plain: Uint8Array): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(label) },
    key,
    new Uint8Array(plain),
  )
  const out = new Uint8Array(IV_BYTES + ciphertext.byteLength)
  out.set(iv)
  out.set(new Uint8Array(ciphertext), IV_BYTES)
  return toBase64(out)
}

const open = async (key: CryptoKey, label: string, sealed: string): Promise<Uint8Array | null> => {
  try {
    const bytes = fromBase64(sealed)
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(0, IV_BYTES), additionalData: encoder.encode(label) },
      key,
      bytes.slice(IV_BYTES),
    )
    return new Uint8Array(plain)
  } catch {
    return null
  }
}

export const sealUserKey = (keys: RecoveryKeys, userKey: StoredUserKey): Promise<string> =>
  seal(keys.userKey, 'chinchi-user-key', encoder.encode(JSON.stringify(userKey)))

export const openUserKey = async (
  keys: RecoveryKeys,
  sealed: string,
): Promise<StoredUserKey | null> => {
  const plain = await open(keys.userKey, 'chinchi-user-key', sealed)
  if (!plain) return null
  try {
    const value = JSON.parse(decoder.decode(plain)) as Partial<StoredUserKey>
    return typeof value.publicKey === 'string' && typeof value.privateKey === 'string'
      ? { publicKey: value.publicKey, privateKey: value.privateKey }
      : null
  } catch {
    return null
  }
}

export const sealEntry = (
  keys: RecoveryKeys,
  messageId: string,
  payload: EncryptedPayload,
): Promise<string> => seal(keys.backup, `chinchi-entry:${messageId}`, encodePayload(payload))

export const openEntry = async (
  keys: RecoveryKeys,
  messageId: string,
  sealed: string,
): Promise<EncryptedPayload | null> => {
  const plain = await open(keys.backup, `chinchi-entry:${messageId}`, sealed)
  return plain ? decodePayload(plain) : null
}
