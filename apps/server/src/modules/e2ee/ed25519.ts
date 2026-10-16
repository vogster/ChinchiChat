import { createPublicKey, verify } from 'node:crypto'

/** DER prefix that turns 32 raw Ed25519 public key bytes into an SPKI key node:crypto reads. */
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

/** Whether `signature` (base64) is the Ed25519 signature of `message` by `publicKey` (base64). */
export const verifyEd25519 = (publicKey: string, message: string, signature: string): boolean => {
  const raw = Buffer.from(publicKey, 'base64')
  const sig = Buffer.from(signature, 'base64')
  if (raw.length !== 32 || sig.length !== 64) return false
  try {
    const key = createPublicKey({
      key: Buffer.concat([SPKI_PREFIX, raw]),
      format: 'der',
      type: 'spki',
    })
    return verify(null, Buffer.from(message), key, sig)
  } catch {
    return false
  }
}
