import { createDeviceKeys } from '@chinchi/e2ee'

import { fromBase64, toBase64 } from './codec'
import { exclusively } from './web-locks'

import type { E2eeApi } from './client-types'
import type { ConversationStore } from './conversation-store'
import type { CrossSigning } from './cross-signing'
import type { DeviceDirectory } from './device-directory'
import type { HistoryBackup } from './history-backup'
import type { KeyPackages } from './key-packages'
import type { E2eeStore } from './store'
import type { DeviceKeys } from '@chinchi/e2ee'

interface StoredDevice {
  /** Absent until the server answers: the keys are saved first, so a reload retries with them. */
  readonly id?: string
  readonly signaturePublicKey: string
  readonly signaturePrivateKey: string
}

export interface ThisDeviceDeps {
  readonly api: E2eeApi
  readonly store: E2eeStore
  readonly userId: string
  /** How the device shows in lists ("Firefox on Linux"). */
  readonly deviceName: string
  readonly directory: DeviceDirectory
  readonly keyPackages: KeyPackages
  readonly conversations: ConversationStore
  readonly crossSigning: CrossSigning
  readonly backup: HistoryBackup
}

/** This browser as an encryption device: registered once, its keys kept in the store. */
export const createThisDevice = ({
  api,
  store,
  userId,
  deviceName,
  directory,
  keyPackages,
  conversations,
  crossSigning,
  backup,
}: ThisDeviceDeps) => {
  let device: Promise<DeviceKeys> | null = null

  const register = async (): Promise<DeviceKeys> => {
    const saved = await store.get<StoredDevice>('device')
    const savedId = saved?.id
    const listed = savedId
      ? (await directory.devicesOf(userId)).some((d) => d.id === savedId && !d.revokedAt)
      : false
    if (saved && savedId && listed) {
      const keys: DeviceKeys = {
        identity: { userId, deviceId: savedId },
        signaturePublicKey: fromBase64(saved.signaturePublicKey),
        signaturePrivateKey: fromBase64(saved.signaturePrivateKey),
      }
      await keyPackages.check(keys)
      return keys
    }
    // An unfinished registration is retried with its keys (the server hands back the same
    // device); otherwise this browser is new here, or its device was removed elsewhere.
    const fresh: DeviceKeys =
      saved && !savedId
        ? {
            identity: { userId, deviceId: '0' },
            signaturePublicKey: fromBase64(saved.signaturePublicKey),
            signaturePrivateKey: fromBase64(saved.signaturePrivateKey),
          }
        : await createDeviceKeys({ userId, deviceId: '0' })
    await store.set('device', {
      signaturePublicKey: toBase64(fresh.signaturePublicKey),
      signaturePrivateKey: toBase64(fresh.signaturePrivateKey),
    } satisfies StoredDevice)
    // The removed device's groups go; what it decrypted and its backup stay readable.
    if (savedId) await conversations.forgetAll()
    const { device: registered } = await api.e2ee.registerDevice({
      name: deviceName,
      signaturePublicKey: toBase64(fresh.signaturePublicKey),
    })
    directory.forgetDevices(userId)
    const keys: DeviceKeys = { ...fresh, identity: { userId, deviceId: registered.id } }
    await store.set('device', {
      id: registered.id,
      signaturePublicKey: toBase64(keys.signaturePublicKey),
      signaturePrivateKey: toBase64(keys.signaturePrivateKey),
    } satisfies StoredDevice)
    await keyPackages.start(keys)
    return keys
  }

  /** The device, registered and (where this browser can) vouched for by the user key. */
  const setUp = async (): Promise<DeviceKeys> => {
    const keys = await register()
    const listed = (await directory.devicesOf(userId)).find((d) => d.id === keys.identity.deviceId)
    try {
      await crossSigning.ensure(keys, Boolean(listed?.userSignature))
      await backup.ensure()
    } catch {
      // Not fatal: the device works unsigned and is approved later.
    }
    directory.forgetDevices(userId)
    return keys
  }

  const ready = async (): Promise<DeviceKeys> => {
    device ??= exclusively(`chinchi-e2ee-device:${userId}`, setUp)
    device.catch(() => {
      device = null
    })
    return device
  }

  return {
    /** Registers this device on first use and keeps its key packages topped up. */
    ready,

    /** This device's public signature key (base64), for its device code. */
    publicKey: async () => {
      await ready()
      return ((await store.get<StoredDevice>('device')) as StoredDevice).signaturePublicKey
    },

    /** Signing out: the server revokes the device (best effort). */
    revoke: async () => {
      const saved = await store.get<StoredDevice>('device')
      // Best effort: with the session already gone the local wipe still happens.
      if (saved?.id) await api.e2ee.deleteDevice(saved.id).catch(() => undefined)
    },

    /** After the store was wiped: the next use registers a new device. */
    reset: () => {
      device = null
    },
  }
}

export type ThisDevice = ReturnType<typeof createThisDevice>
