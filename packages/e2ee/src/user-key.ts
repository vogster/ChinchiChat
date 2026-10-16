import { cipherSuite } from './suite'

import type { CryptoBackend } from './suite'

/**
 * A user's own key (cross-signing). It signs the user's devices: whoever checked the user once
 * trusts every device the user approved, and a device someone else slipped in stands out.
 */
export interface UserKeyPair {
  readonly publicKey: Uint8Array
  readonly privateKey: Uint8Array
}

const encoder = new TextEncoder()

export const createUserKey = async (backend?: CryptoBackend): Promise<UserKeyPair> => {
  const { publicKey, signKey } = await (await cipherSuite(backend)).signature.keygen()
  return { publicKey, privateKey: signKey }
}

/** A plain Ed25519 signature of the statement (the server checks it too). */
export const signStatement = async (
  privateKey: Uint8Array,
  statement: string,
  backend?: CryptoBackend,
): Promise<Uint8Array> =>
  (await cipherSuite(backend)).signature.sign(privateKey, encoder.encode(statement))

export const verifyStatement = async (
  publicKey: Uint8Array,
  statement: string,
  signature: Uint8Array,
  backend?: CryptoBackend,
): Promise<boolean> => {
  try {
    return await (
      await cipherSuite(backend)
    ).signature.verify(publicKey, encoder.encode(statement), signature)
  } catch {
    return false
  }
}
