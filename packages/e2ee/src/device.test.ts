import { describe, expect, it } from 'vitest'

import {
  createDeviceKeys,
  createKeyPackages,
  decodeIdentity,
  decodeKeyPackage,
  encodeIdentity,
  unpackPrivate,
} from './device'

describe('device identity', () => {
  it('round-trips as "user:device" and rejects anything else', () => {
    expect(decodeIdentity(encodeIdentity({ userId: '100', deviceId: '7' }))).toEqual({
      userId: '100',
      deviceId: '7',
    })
    expect(decodeIdentity(new TextEncoder().encode('alice'))).toBeNull()
    expect(decodeIdentity(new TextEncoder().encode('1:2:3'))).toBeNull()
  })
})

describe('key packages', () => {
  it('are distinct one-time tickets signed with the device key', async () => {
    const keys = await createDeviceKeys({ userId: '1', deviceId: '2' })
    const bundles = await createKeyPackages(keys, 3)

    expect(new Set(bundles.map((b) => b.publicPackage.join(','))).size).toBe(3)
    for (const bundle of bundles) {
      const keyPackage = decodeKeyPackage(bundle.publicPackage)
      expect(keyPackage.leafNode.signaturePublicKey).toEqual(keys.signaturePublicKey)
      expect(unpackPrivate(bundle.privatePackage).signaturePrivateKey).toEqual(
        keys.signaturePrivateKey,
      )
    }
  })

  it('refuse bytes that are not a key package', () => {
    expect(() => decodeKeyPackage(new Uint8Array([0, 1, 2, 3]))).toThrow()
  })
})
