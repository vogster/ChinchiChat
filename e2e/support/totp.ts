import { createHmac } from 'node:crypto'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

const base32Decode = (text: string): Buffer => {
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const char of text.toUpperCase()) {
    value = (value << 5) | ALPHABET.indexOf(char)
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/**
 * What an authenticator app would show for the secret (RFC 6238). `stepOffset` 1 gives the
 * next 30 seconds' code: each code works once, so a sign-in right after enabling needs it.
 */
export const totpCode = (secret: string, stepOffset = 0): string => {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + stepOffset))
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest()
  const offset = (hmac[hmac.length - 1] as number) & 0xf
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}
