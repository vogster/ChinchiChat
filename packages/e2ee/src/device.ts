import {
  decodeMlsMessage,
  defaultCapabilities,
  defaultLifetime,
  encodeMlsMessage,
  generateKeyPackageWithKey,
} from 'ts-mls'

import { cipherSuite } from './suite'

import type { CryptoBackend } from './suite'
import type { KeyPackage, PrivateKeyPackage } from 'ts-mls'

/** Who a device belongs to; it is the MLS credential of every leaf it holds. */
export interface DeviceIdentity {
  readonly userId: string
  readonly deviceId: string
}

/** A device's long-term signing key: its identity in every conversation. Never leaves it. */
export interface DeviceKeys {
  readonly identity: DeviceIdentity
  readonly signaturePublicKey: Uint8Array
  readonly signaturePrivateKey: Uint8Array
}

/**
 * A one-time ticket for adding this device to a conversation: the public half goes to the
 * server, the private half stays on the device until a Welcome uses it.
 */
export interface KeyPackageBundle {
  /** Encoded MLS message, as uploaded. */
  readonly publicPackage: Uint8Array
  readonly privatePackage: Uint8Array
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export const encodeIdentity = ({ userId, deviceId }: DeviceIdentity): Uint8Array =>
  encoder.encode(`${userId}:${deviceId}`)

export const decodeIdentity = (bytes: Uint8Array): DeviceIdentity | null => {
  const match = /^(\d{1,20}):(\d{1,20})$/.exec(decoder.decode(bytes))
  return match ? { userId: match[1] as string, deviceId: match[2] as string } : null
}

export const createDeviceKeys = async (
  identity: DeviceIdentity,
  backend?: CryptoBackend,
): Promise<DeviceKeys> => {
  const { publicKey, signKey } = await (await cipherSuite(backend)).signature.keygen()
  return { identity, signaturePublicKey: publicKey, signaturePrivateKey: signKey }
}

/** The three private keys back to back, each prefixed with its length. */
const packPrivate = (keys: PrivateKeyPackage): Uint8Array => {
  const parts = [keys.initPrivateKey, keys.hpkePrivateKey, keys.signaturePrivateKey]
  const out = new Uint8Array(parts.reduce((sum, part) => sum + 2 + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out[offset] = part.length >> 8
    out[offset + 1] = part.length & 0xff
    out.set(part, offset + 2)
    offset += 2 + part.length
  }
  return out
}

export const unpackPrivate = (bytes: Uint8Array): PrivateKeyPackage => {
  const parts: Uint8Array[] = []
  let offset = 0
  for (let i = 0; i < 3; i += 1) {
    const length = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0)
    parts.push(bytes.slice(offset + 2, offset + 2 + length))
    offset += 2 + length
  }
  const [initPrivateKey, hpkePrivateKey, signaturePrivateKey] = parts as [
    Uint8Array,
    Uint8Array,
    Uint8Array,
  ]
  return { initPrivateKey, hpkePrivateKey, signaturePrivateKey }
}

export const decodeKeyPackage = (bytes: Uint8Array): KeyPackage => {
  const message = decodeMlsMessage(bytes, 0)?.[0]
  if (message?.wireformat !== 'mls_key_package') throw new Error('Not a key package')
  return message.keyPackage
}

/** Key packages signed with the device's key, so every leaf it gets carries its identity. */
export const createKeyPackages = async (
  device: DeviceKeys,
  count: number,
  backend?: CryptoBackend,
): Promise<KeyPackageBundle[]> => {
  const impl = await cipherSuite(backend)
  const credential = { credentialType: 'basic' as const, identity: encodeIdentity(device.identity) }
  return Promise.all(
    Array.from({ length: count }, async () => {
      const { publicPackage, privatePackage } = await generateKeyPackageWithKey(
        credential,
        defaultCapabilities(),
        defaultLifetime,
        [],
        { signKey: device.signaturePrivateKey, publicKey: device.signaturePublicKey },
        impl,
      )
      return {
        publicPackage: encodeMlsMessage({
          keyPackage: publicPackage,
          wireformat: 'mls_key_package',
          version: 'mls10',
        }),
        privatePackage: packPrivate(privatePackage),
      }
    }),
  )
}
