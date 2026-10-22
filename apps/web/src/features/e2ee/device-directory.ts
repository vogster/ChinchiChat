import { toBase64 } from './codec'

import type { E2eeApi } from './client-types'
import type { ConversationOptions } from '@chinchi/e2ee'
import type { Device } from '@chinchi/shared'

/**
 * What the server says about people's devices and user keys, asked once and kept until their
 * devices change (or a conversation opens and looks again).
 */
export const createDeviceDirectory = ({ api, userId }: { api: E2eeApi; userId: string }) => {
  const devicesByUser = new Map<string, Promise<Device[]>>()
  const userKeys = new Map<string, Promise<string | null>>()

  const devicesOf = (id: string) => {
    let found = devicesByUser.get(id)
    if (!found) {
      found = (id === userId ? api.e2ee.myDevices() : api.e2ee.devicesOf(id)).then((r) => r.devices)
      devicesByUser.set(id, found)
      found.catch(() => devicesByUser.delete(id))
    }
    return found
  }

  /** A user's public key as the server has it now; kept until their devices change. */
  const userKeyOf = (id: string) => {
    let found = userKeys.get(id)
    if (!found) {
      found = api.e2ee.userKey(id === userId ? '@me' : id).then((r) => r.userKey?.publicKey ?? null)
      userKeys.set(id, found)
      found.catch(() => userKeys.delete(id))
    }
    return found
  }

  /** A device may be in a conversation if the server lists it for its user with that key. */
  const options: ConversationOptions = {
    trust: async (identity, signaturePublicKey) => {
      const key = toBase64(signaturePublicKey)
      const listed = async () =>
        (await devicesOf(identity.userId)).some(
          (d) => d.id === identity.deviceId && d.signaturePublicKey === key,
        )
      if (await listed()) return true
      // A device added a moment ago: look again once.
      devicesByUser.delete(identity.userId)
      return listed()
    },
  }

  return {
    devicesOf,
    userKeyOf,
    options,

    /** Every active device the server lists for these members (device ids). */
    listedDevices: async (memberIds: readonly string[]): Promise<ReadonlySet<string>> => {
      const lists = await Promise.all(memberIds.map((memberId) => devicesOf(memberId)))
      return new Set(
        lists
          .flat()
          .filter((d) => !d.revokedAt)
          .map((d) => d.id),
      )
    },

    /** Someone's device list only (it changed: a device of theirs registered or went). */
    forgetDevices: (id: string) => {
      devicesByUser.delete(id)
    },

    /** What is known of someone's devices and key goes: the next look asks the server again. */
    forgetUser: (id: string) => {
      devicesByUser.delete(id)
      userKeys.delete(id)
    },

    clear: () => {
      devicesByUser.clear()
      userKeys.clear()
    },
  }
}

export type DeviceDirectory = ReturnType<typeof createDeviceDirectory>
