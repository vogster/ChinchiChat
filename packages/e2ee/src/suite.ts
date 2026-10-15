import { getCiphersuiteFromName, getCiphersuiteImpl, nobleCryptoProvider } from 'ts-mls'

import type { CiphersuiteImpl } from 'ts-mls'

/** RFC 9420's mandatory suite: X25519, AES-128-GCM, SHA-256, Ed25519. */
export const CIPHERSUITE = 'MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519' as const

/**
 * WebCrypto where the platform has it (browsers, Node); `pure` runs on plain JavaScript, for
 * platforms without WebCrypto (React Native). Both interoperate.
 */
export type CryptoBackend = 'webcrypto' | 'pure'

const cache = new Map<CryptoBackend, Promise<CiphersuiteImpl>>()

export const cipherSuite = (backend: CryptoBackend = 'webcrypto'): Promise<CiphersuiteImpl> => {
  const cached = cache.get(backend)
  if (cached) return cached
  const suite = getCiphersuiteFromName(CIPHERSUITE)
  const impl =
    backend === 'pure' ? getCiphersuiteImpl(suite, nobleCryptoProvider) : getCiphersuiteImpl(suite)
  cache.set(backend, impl)
  return impl
}
