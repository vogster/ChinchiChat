import { createUserKey, signStatement } from '@chinchi/e2ee'
import { ApiError } from '@chinchi/sdk'
import { deviceStatement } from '@chinchi/shared'

import { fromBase64, toBase64 } from './codec'

import type { E2eeApi } from './client'
import type { E2eeStore } from './store'
import type { DeviceKeys } from '@chinchi/e2ee'

/** The user key as this browser holds it (only on devices the user approved). */
export interface StoredUserKey {
  readonly publicKey: string
  readonly privateKey: string
}

const USER_KEY = 'userKey'

export interface CrossSigningDeps {
  readonly api: E2eeApi
  readonly store: E2eeStore
  readonly userId: string
}

/**
 * Cross-signing: the user key vouches for the user's devices. The first device creates the
 * key; a device holding it signs itself; one without it waits to be approved by one that has it.
 */
export const createCrossSigning = ({ api, store, userId }: CrossSigningDeps) => {
  const sign = async (privateKey: string, keys: DeviceKeys) => {
    const { deviceId } = keys.identity
    const statement = deviceStatement(userId, deviceId, toBase64(keys.signaturePublicKey))
    const signature = await signStatement(fromBase64(privateKey), statement)
    await api.e2ee.signDevice(deviceId, toBase64(signature))
  }

  /** Creates the user key if nobody has; false when another device was first. */
  const create = async (keys: DeviceKeys): Promise<boolean> => {
    const pair = await createUserKey()
    const stored: StoredUserKey = {
      publicKey: toBase64(pair.publicKey),
      privateKey: toBase64(pair.privateKey),
    }
    try {
      await api.e2ee.setUserKey({ publicKey: stored.publicKey })
    } catch (error) {
      if (error instanceof ApiError && error.code === 'USER_KEY_EXISTS') return false
      throw error
    }
    await store.set(USER_KEY, stored)
    await sign(stored.privateKey, keys)
    return true
  }

  return {
    /** Makes sure this device is vouched for, if this browser can do it. */
    ensure: async (keys: DeviceKeys, signed: boolean): Promise<void> => {
      const [{ userKey }, held] = await Promise.all([
        api.e2ee.userKey('@me'),
        store.get<StoredUserKey>(USER_KEY),
      ])
      if (!userKey) {
        await create(keys)
        return
      }
      if (held?.publicKey === userKey.publicKey && !signed) await sign(held.privateKey, keys)
    },

    held: () => store.get<StoredUserKey>(USER_KEY),

    /** Takes the user key (from the recovery key or another device) and vouches for this one. */
    adopt: async (userKey: StoredUserKey, keys: DeviceKeys): Promise<void> => {
      await store.set(USER_KEY, userKey)
      await sign(userKey.privateKey, keys)
    },
  }
}

export type CrossSigning = ReturnType<typeof createCrossSigning>
