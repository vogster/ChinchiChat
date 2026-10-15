import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const STEP_MS = 30_000
/** One step either way covers clocks a little off and codes typed at the boundary. */
const WINDOW = 1

export const base32Encode = (bytes: Buffer): string => {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

const base32Decode = (text: string): Buffer => {
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const char of text.replace(/=+$/, '').toUpperCase()) {
    const index = ALPHABET.indexOf(char)
    if (index < 0) throw new Error('Invalid base32')
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/** 160 random bits, as RFC 4226 recommends for HMAC-SHA1. */
export const generateTotpSecret = (): string => base32Encode(randomBytes(20))

/** The six-digit code for a 30-second step (RFC 6238, HMAC-SHA1). */
export const totpCode = (secret: string, step: number): string => {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest()
  const offset = (hmac[hmac.length - 1] as number) & 0xf
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff
  return String(binary % 1_000_000).padStart(6, '0')
}

/**
 * The step a code belongs to, or null if it is wrong, too old, or not newer than
 * `lastStep` (each code works once).
 */
export const verifyTotp = (
  secret: string,
  code: string,
  nowMs: number,
  lastStep: number | null,
): number | null => {
  const current = Math.floor(nowMs / STEP_MS)
  for (let step = current - WINDOW; step <= current + WINDOW; step += 1) {
    if (lastStep !== null && step <= lastStep) continue
    const expected = Buffer.from(totpCode(secret, step))
    const given = Buffer.from(code)
    if (given.length === expected.length && timingSafeEqual(given, expected)) return step
  }
  return null
}

export const totpUri = (secret: string, account: string, issuer: string): string => {
  const label = encodeURIComponent(`${issuer}:${account}`)
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  })
  return `otpauth://totp/${label}?${params.toString()}`
}
