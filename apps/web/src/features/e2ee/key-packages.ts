import { createKeyPackages } from '@chinchi/e2ee'

import { fromBase64, toBase64 } from './codec'

import type { E2eeApi } from './client-types'
import type { E2eeStore } from './store'
import type { DeviceKeys, KeyPackageBundle } from '@chinchi/e2ee'

export interface StoredBundle {
  readonly publicPackage: string
  readonly privatePackage: string
  /** Handed out once the one-time packages run out, possibly many times: kept after a join. */
  readonly lastResort?: true
}

const KEY_PACKAGE_BATCH = 20
const KEY_PACKAGE_LOW = 10

/**
 * This device's key packages: one-time ones others claim to add it to conversations, and a last
 * resort the server hands out once those run out. Their private halves stay here.
 */
export const createKeyPackageStore = ({ api, store }: { api: E2eeApi; store: E2eeStore }) => {
  const stored = async () => (await store.get<StoredBundle[]>('bundles')) ?? []

  /** Keeps new bundles; with `lastResort`, the first is the new last resort (replacing one). */
  const save = async (bundles: readonly KeyPackageBundle[], lastResort: boolean) => {
    const kept = await stored()
    await store.set('bundles', [
      ...(lastResort ? kept.filter((b) => !b.lastResort) : kept),
      ...bundles.map((b, index) => ({
        publicPackage: toBase64(b.publicPackage),
        privatePackage: toBase64(b.privatePackage),
        ...(lastResort && index === 0 ? { lastResort: true as const } : {}),
      })),
    ])
  }

  const topUp = async (keys: DeviceKeys, lastResort: boolean) => {
    const bundles = await createKeyPackages(keys, KEY_PACKAGE_BATCH + (lastResort ? 1 : 0))
    await save(bundles, lastResort)
    const encoded = bundles.map((b) => toBase64(b.publicPackage))
    await api.e2ee.uploadKeyPackages(keys.identity.deviceId, {
      packages: lastResort ? encoded.slice(1) : encoded,
      ...(lastResort ? { lastResort: encoded[0] as string } : {}),
    })
  }

  /** More one-time packages once few are left: joins and others' claims use them up. */
  const refill = async (keys: DeviceKeys) => {
    const { count } = await api.e2ee.countKeyPackages(keys.identity.deviceId)
    if (count < KEY_PACKAGE_LOW) await topUp(keys, false)
  }

  return {
    refill,

    /** A new device: its first packages and last resort. */
    start: async (keys: DeviceKeys) => {
      await store.set('bundles', [])
      await topUp(keys, true)
    },

    /** A known device on load: topped up (kept before last resorts were marked: a new one). */
    check: async (keys: DeviceKeys) => {
      if (!(await stored()).some((b) => b.lastResort)) await topUp(keys, true)
      else await refill(keys)
    },

    /** Every bundle, to find the one a Welcome was made for. */
    bundles: async () =>
      (await stored()).map((b) => ({
        stored: b,
        bundle: {
          publicPackage: fromBase64(b.publicPackage),
          privatePackage: fromBase64(b.privatePackage),
        },
      })),

    /**
     * A Welcome opened with this bundle: a one-time one is spent, the last resort may open more.
     * Read again: a join in another conversation (or tab) may have changed the list meanwhile.
     */
    spend: async (used: StoredBundle) => {
      if (used.lastResort) return
      await store.set(
        'bundles',
        (await stored()).filter((b) => b.publicPackage !== used.publicPackage),
      )
    },
  }
}

export type KeyPackages = ReturnType<typeof createKeyPackageStore>
