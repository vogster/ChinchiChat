export const toBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export const fromBase64 = (text: string): Uint8Array =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0))

/** What an encrypted message carries inside MLS. Versioned, so it can grow. */
export interface EncryptedPayload {
  readonly v: 1
  readonly text: string
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export const encodePayload = (payload: EncryptedPayload): Uint8Array =>
  encoder.encode(JSON.stringify(payload))

/** Null for anything that is not a payload this version understands. */
export const decodePayload = (bytes: Uint8Array): EncryptedPayload | null => {
  try {
    const value = JSON.parse(decoder.decode(bytes)) as Partial<EncryptedPayload>
    return value.v === 1 && typeof value.text === 'string' ? { v: 1, text: value.text } : null
  } catch {
    return null
  }
}
