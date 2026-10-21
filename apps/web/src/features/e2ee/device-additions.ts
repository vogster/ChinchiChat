/**
 * How many times this client adds the same device to a conversation before it stops: members
 * who disagree about a device (each lets devices in on its own) would otherwise take turns
 * adding and removing it, every commit waking the other up.
 */
export const MAX_ADDITIONS = 2

/** The devices this client added to conversations, counted until their owner's list changes. */
export const createDeviceAdditions = () => {
  /** `channel/device` → how often it was added, and whose it is (to start over). */
  const added = new Map<string, { readonly ownerId: string; readonly count: number }>()
  const key = (channelId: string, deviceId: string) => `${channelId}/${deviceId}`
  const times = (channelId: string, deviceId: string) =>
    added.get(key(channelId, deviceId))?.count ?? 0

  return {
    /** Whether this client may still add the device to the conversation. */
    allowed: (channelId: string, deviceId: string) => times(channelId, deviceId) < MAX_ADDITIONS,

    /** The devices went in with a commit of this client. */
    record: (channelId: string, devices: readonly { deviceId: string; ownerId: string }[]) => {
      for (const { deviceId, ownerId } of devices) {
        added.set(key(channelId, deviceId), { ownerId, count: times(channelId, deviceId) + 1 })
      }
    },

    /** Someone's devices changed: theirs may be added again, wherever they were taken out. */
    forgetOwner: (ownerId: string) => {
      for (const [entry, device] of added) {
        if (device.ownerId === ownerId) added.delete(entry)
      }
    },

    clear: () => added.clear(),
  }
}
