import { verifyStatement } from '@chinchi/e2ee'
import { deviceStatement } from '@chinchi/shared'

import { fromBase64 } from './codec'

import type { E2eeStore } from './store'
import type { Device } from '@chinchi/shared'

/**
 * Checking who is on the other end. The server lists a user's devices, so a server that lies
 * could slip in one of its own. People are checked once, by their user key (the safety code);
 * devices signed by the key this device knows for them pass quietly. Any other device waits
 * until the person here lets it in, having compared its device code with its owner.
 */
export interface SafetyDeps {
  readonly store: E2eeStore
  readonly userId: string
  readonly devicesOf: (userId: string) => Promise<readonly Device[]>
  /** The user's public key (base64), or null if they never set one. */
  readonly userKeyOf: (userId: string) => Promise<string | null>
  readonly thisDevice: () => Promise<string>
  /** This device's public signature key (base64), for its device code. */
  readonly thisDeviceKey: () => Promise<string>
}

export interface PersonSafety {
  readonly userId: string
  /** The code was compared, and their user key is still the one it was compared for. */
  readonly verified: boolean
  /** Devices waiting to be let in: not signed by the key known here, not accepted. */
  readonly newDevices: readonly Device[]
  /** Their user key is not the one known here: they reset their keys (or someone else did). */
  readonly keyChanged: boolean
}

export interface SafetyStatus {
  readonly people: readonly PersonSafety[]
  /** Devices on my own account my user key does not vouch for, other than this one. */
  readonly mine: readonly Device[]
}

const CODE_GROUPS = 12
const DEVICE_CODE_GROUPS = 4
const GROUP_BYTES = 5

const active = (devices: readonly Device[]) => devices.filter((device) => !device.revokedAt)

/** Who a user is for encryption: their user key, or (without one) their devices' keys. */
const identityOf = (userId: string, userKey: string | null, devices: readonly Device[]) =>
  userKey
    ? `${userId}:user:${userKey}`
    : `${userId}:devices:${active(devices)
        .map((device) => device.signaturePublicKey)
        .sort()
        .join(',')}`

const byId = (a: string, b: string) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0)

/** Digits from a digest, in groups of five (5 bytes each, mod 100000). */
const toDigits = (digest: Uint8Array, groups: number) =>
  Array.from({ length: groups }, (_, group) =>
    digest
      .slice(group * GROUP_BYTES, (group + 1) * GROUP_BYTES)
      .reduce((value, byte) => value * 256 + byte, 0),
  )
    .map((value) => (value % 100_000).toString().padStart(5, '0'))
    .join('')

const sha512 = async (text: string) =>
  new Uint8Array(await crypto.subtle.digest('SHA-512', new TextEncoder().encode(text)))

/**
 * A device's code: 20 digits (about 66 bits) from its public signature key, read aloud to let
 * it in. There is no exchange behind it, so it is long enough that no one can make a key of
 * their own match it.
 */
const deviceCode = async (signaturePublicKey: string) =>
  toDigits(await sha512(`chinchi-device-v1\n${signaturePublicKey}`), DEVICE_CODE_GROUPS)

/** Checked here, not taken from the server: the signature is by the user key we know. */
const vouched = async (userId: string, userKey: string | null, device: Device) =>
  Boolean(userKey && device.userSignature) &&
  verifyStatement(
    fromBase64(userKey as string),
    deviceStatement(userId, device.id, device.signaturePublicKey),
    fromBase64(device.userSignature as string),
  )

/** Device ids acknowledged with "got it": mine still, others' before consent was required. */
const seenKey = (userId: string) => `safety:seen:${userId}`
/** Devices let in by the person here: device id → its public signature key then. */
const acceptedKey = (userId: string) => `safety:accepted:${userId}`
const userKeyKey = (userId: string) => `safety:userKey:${userId}`
const verifiedKey = (userId: string) => `safety:verified:${userId}`

export const createSafety = ({
  store,
  userId,
  devicesOf,
  userKeyOf,
  thisDevice,
  thisDeviceKey,
}: SafetyDeps) => {
  /**
   * The user key this device trusts for someone: the first one seen (and a first key after
   * none), until the person here accepts another.
   */
  const knownKey = async (id: string, current: string | null) => {
    const known = await store.get<string | null>(userKeyKey(id))
    if (known === undefined || (known === null && current !== null)) {
      await store.set(userKeyKey(id), current)
      return current
    }
    return known
  }

  /** Devices let in here; the ids acknowledged before consent was required count, once. */
  const accepted = async (id: string, devices: readonly Device[]) => {
    const stored = await store.get<Record<string, string>>(acceptedKey(id))
    if (stored) return stored
    const seen = (await store.get<string[]>(seenKey(id))) ?? []
    const carried = Object.fromEntries(
      devices
        .filter((device) => seen.includes(device.id))
        .map((device) => [device.id, device.signaturePublicKey]),
    )
    await store.set(acceptedKey(id), carried)
    return carried
  }

  const look = async (id: string) => {
    const [devices, userKey] = await Promise.all([devicesOf(id), userKeyOf(id)])
    const current = active(devices)
    const known = await knownKey(id, userKey)
    const flags = await Promise.all(current.map((device) => vouched(id, known, device)))
    return {
      userKey,
      keyChanged: known !== null && known !== userKey,
      devices: current,
      unvouched: current.filter((_, i) => !flags[i]),
    }
  }

  /** Devices of someone that wait: unvouched, and not let in with this very key. */
  const waiting = async (id: string, seen: Awaited<ReturnType<typeof look>>) => {
    const ok = await accepted(id, seen.devices)
    return seen.unvouched.filter((device) => ok[device.id] !== device.signaturePublicKey)
  }

  /** My own unvouched devices not acknowledged yet: pointed out, never let in from here. */
  const unseenOwn = async (unvouched: readonly Device[]) => {
    const seen = (await store.get<string[]>(seenKey(userId))) ?? []
    return unvouched.filter((device) => !seen.includes(device.id))
  }

  return {
    /**
     * The user's devices that messages may be encrypted for: those the user key known here
     * vouches for, plus those the person here let in. My own unvouched devices never are:
     * I approve them myself, on a device that holds the key.
     */
    allowedDevices: async (id: string): Promise<ReadonlySet<string>> => {
      const seen = await look(id)
      const pending = new Set(
        (id === userId ? seen.unvouched : await waiting(id, seen)).map((device) => device.id),
      )
      return new Set(seen.devices.filter((d) => !pending.has(d.id)).map((d) => d.id))
    },

    /** The code both people see for each other: compare it once to know it's them. */
    codeWith: async (otherId: string): Promise<string> => {
      const [first, second] = [userId, otherId].sort(byId) as [string, string]
      const [a, b] = await Promise.all([look(first), look(second)])
      return toDigits(
        await sha512(
          `chinchi-safety-v2\n${identityOf(first, a.userKey, a.devices)}\n${identityOf(second, b.userKey, b.devices)}`,
        ),
        CODE_GROUPS,
      )
    },

    /** A device's code, to compare with its owner before letting it in. */
    deviceCode,

    /** This device's code, for the person who can let it in. */
    thisDeviceCode: async () => deviceCode(await thisDeviceKey()),

    status: async (memberIds: readonly string[]): Promise<SafetyStatus> => {
      const people = await Promise.all(
        memberIds
          .filter((id) => id !== userId)
          .map(async (id): Promise<PersonSafety> => {
            const seen = await look(id)
            const verified =
              (await store.get<string>(verifiedKey(id))) ===
              identityOf(id, seen.userKey, seen.devices)
            return {
              userId: id,
              verified,
              newDevices: await waiting(id, seen),
              keyChanged: seen.keyChanged,
            }
          }),
      )
      const here = await thisDevice()
      const mine = await unseenOwn((await look(userId)).unvouched)
      return { people, mine: mine.filter((device) => device.id !== here) }
    },

    /** The codes matched: remember who they are, and trust the user key they were compared for. */
    verify: async (id: string) => {
      const { userKey, devices } = await look(id)
      await store.set(verifiedKey(id), identityOf(id, userKey, devices))
      await store.set(userKeyKey(id), userKey)
    },

    /** Lets in one device of someone, as it is now: a new key under its id asks again. */
    acceptDevice: async (id: string, deviceId: string) => {
      const { devices } = await look(id)
      const device = devices.find((d) => d.id === deviceId)
      if (!device) return
      const ok = await accepted(id, devices)
      await store.set(acceptedKey(id), { ...ok, [deviceId]: device.signaturePublicKey })
    },

    /** Trusts someone's new user key (after a reset): devices it signs pass from now on. */
    acceptKey: async (id: string) => {
      await store.set(userKeyKey(id), await userKeyOf(id))
    },

    /** The warning about my own devices was seen: stop showing it until another appears. */
    acknowledge: async (id: string) => {
      if (id !== userId) return
      const { unvouched } = await look(id)
      await store.set(
        seenKey(id),
        unvouched.map((device) => device.id),
      )
    },
  }
}

export type Safety = ReturnType<typeof createSafety>
