import type { E2eeStore } from './store'
import type { Device } from '@chinchi/shared'

/**
 * Checking who is on the other end. The server vouches for the devices of a user, so a server
 * that lies could slip in a device of its own; comparing safety codes in person (or over
 * another channel) catches that, and a new device of someone already checked is announced.
 */
export interface SafetyDeps {
  readonly store: E2eeStore
  readonly userId: string
  readonly devicesOf: (userId: string) => Promise<readonly Device[]>
  readonly thisDevice: () => Promise<string>
}

export interface PersonSafety {
  readonly userId: string
  /** Their devices are the ones they had when the code was compared. */
  readonly verified: boolean
  /** Devices that appeared since this browser last looked (and the user acknowledged). */
  readonly newDevices: readonly Device[]
}

export interface SafetyStatus {
  readonly people: readonly PersonSafety[]
  /** New devices on my own account, other than this one. */
  readonly mine: readonly Device[]
}

const CODE_GROUPS = 12
const GROUP_BYTES = 5

const active = (devices: readonly Device[]) => devices.filter((device) => !device.revokedAt)

/** Who a user is, as far as encryption goes: their id and the keys of their devices. */
const identityOf = (userId: string, devices: readonly Device[]) =>
  `${userId}:${active(devices)
    .map((device) => device.signaturePublicKey)
    .sort()
    .join(',')}`

const byId = (a: string, b: string) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0)

/** 60 digits from a digest, in twelve groups of five (5 bytes each, mod 100000). */
const toDigits = (digest: Uint8Array) =>
  Array.from({ length: CODE_GROUPS }, (_, group) =>
    digest
      .slice(group * GROUP_BYTES, (group + 1) * GROUP_BYTES)
      .reduce((value, byte) => value * 256 + byte, 0),
  )
    .map((value) => (value % 100_000).toString().padStart(5, '0'))
    .join('')

const sha512 = async (text: string) =>
  new Uint8Array(await crypto.subtle.digest('SHA-512', new TextEncoder().encode(text)))

const seenKey = (userId: string) => `safety:seen:${userId}`
const verifiedKey = (userId: string) => `safety:verified:${userId}`

export const createSafety = ({ store, userId, devicesOf, thisDevice }: SafetyDeps) => {
  /** Devices not seen before; the first look trusts what is there. */
  const newDevicesOf = async (id: string, devices: readonly Device[]) => {
    const seen = await store.get<string[]>(seenKey(id))
    if (!seen) {
      await store.set(
        seenKey(id),
        devices.map((device) => device.id),
      )
      return []
    }
    return devices.filter((device) => !seen.includes(device.id))
  }

  const acknowledge = async (id: string) => {
    const devices = active(await devicesOf(id))
    await store.set(
      seenKey(id),
      devices.map((device) => device.id),
    )
  }

  return {
    /** The code both people see for each other: compare it to know the devices are theirs. */
    codeWith: async (otherId: string): Promise<string> => {
      const [first, second] = [userId, otherId].sort(byId) as [string, string]
      const [a, b] = await Promise.all([devicesOf(first), devicesOf(second)])
      return toDigits(
        await sha512(`chinchi-safety-v1\n${identityOf(first, a)}\n${identityOf(second, b)}`),
      )
    },

    status: async (memberIds: readonly string[]): Promise<SafetyStatus> => {
      const people = await Promise.all(
        memberIds
          .filter((id) => id !== userId)
          .map(async (id): Promise<PersonSafety> => {
            const devices = active(await devicesOf(id))
            const verified = (await store.get<string>(verifiedKey(id))) === identityOf(id, devices)
            return { userId: id, verified, newDevices: await newDevicesOf(id, devices) }
          }),
      )
      const here = await thisDevice()
      const mine = await newDevicesOf(userId, active(await devicesOf(userId)))
      return { people, mine: mine.filter((device) => device.id !== here) }
    },

    /** The codes matched: remember their devices as checked (and as seen). */
    verify: async (id: string) => {
      await store.set(verifiedKey(id), identityOf(id, await devicesOf(id)))
      await acknowledge(id)
    },

    /** The new devices are known now: stop warning about them. */
    acknowledge,
  }
}

export type Safety = ReturnType<typeof createSafety>
