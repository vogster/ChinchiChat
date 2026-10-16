import { verifyStatement } from '@chinchi/e2ee'
import { deviceStatement } from '@chinchi/shared'

import { fromBase64 } from './codec'

import type { E2eeStore } from './store'
import type { Device } from '@chinchi/shared'

/**
 * Checking who is on the other end. The server lists a user's devices, so a server that lies
 * could slip in one of its own. People are checked once, by their user key (the safety code);
 * devices they approved carry its signature and pass quietly, others are pointed out.
 */
export interface SafetyDeps {
  readonly store: E2eeStore
  readonly userId: string
  readonly devicesOf: (userId: string) => Promise<readonly Device[]>
  /** The user's public key (base64), or null if they never set one. */
  readonly userKeyOf: (userId: string) => Promise<string | null>
  readonly thisDevice: () => Promise<string>
}

export interface PersonSafety {
  readonly userId: string
  /** The code was compared, and their user key is still the one it was compared for. */
  readonly verified: boolean
  /** Devices their user key does not vouch for, not acknowledged yet. */
  readonly newDevices: readonly Device[]
  /** Their user key changed since last seen: they reset their keys (or someone else did). */
  readonly keyChanged: boolean
}

export interface SafetyStatus {
  readonly people: readonly PersonSafety[]
  /** Devices on my own account my user key does not vouch for, other than this one. */
  readonly mine: readonly Device[]
}

const CODE_GROUPS = 12
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

/** Checked here, not taken from the server: the signature is by the user key we know. */
const vouched = async (userId: string, userKey: string | null, device: Device) =>
  Boolean(userKey && device.userSignature) &&
  verifyStatement(
    fromBase64(userKey as string),
    deviceStatement(userId, device.id, device.signaturePublicKey),
    fromBase64(device.userSignature as string),
  )

const seenKey = (userId: string) => `safety:seen:${userId}`
const userKeyKey = (userId: string) => `safety:userKey:${userId}`
const verifiedKey = (userId: string) => `safety:verified:${userId}`

export const createSafety = ({ store, userId, devicesOf, userKeyOf, thisDevice }: SafetyDeps) => {
  const look = async (id: string) => {
    const [devices, userKey] = await Promise.all([devicesOf(id), userKeyOf(id)])
    const current = active(devices)
    const flags = await Promise.all(current.map((device) => vouched(id, userKey, device)))
    return { userKey, devices: current, unvouched: current.filter((_, i) => !flags[i]) }
  }

  /** Unvouched devices not acknowledged yet; the first look takes things as they are. */
  const unseen = async (id: string, unvouched: readonly Device[]) => {
    const seen = await store.get<string[]>(seenKey(id))
    if (!seen) {
      await store.set(
        seenKey(id),
        unvouched.map((device) => device.id),
      )
      return []
    }
    return unvouched.filter((device) => !seen.includes(device.id))
  }

  /** Whether the user key changed since last seen (the first look remembers it). */
  const changed = async (id: string, userKey: string | null) => {
    const known = await store.get<string | null>(userKeyKey(id))
    if (known === undefined) {
      await store.set(userKeyKey(id), userKey)
      return false
    }
    return known !== null && known !== userKey
  }

  const acknowledge = async (id: string) => {
    const { userKey, unvouched } = await look(id)
    await store.set(
      seenKey(id),
      unvouched.map((device) => device.id),
    )
    await store.set(userKeyKey(id), userKey)
  }

  return {
    /** The code both people see for each other: compare it once to know it's them. */
    codeWith: async (otherId: string): Promise<string> => {
      const [first, second] = [userId, otherId].sort(byId) as [string, string]
      const [a, b] = await Promise.all([look(first), look(second)])
      return toDigits(
        await sha512(
          `chinchi-safety-v2\n${identityOf(first, a.userKey, a.devices)}\n${identityOf(second, b.userKey, b.devices)}`,
        ),
      )
    },

    status: async (memberIds: readonly string[]): Promise<SafetyStatus> => {
      const people = await Promise.all(
        memberIds
          .filter((id) => id !== userId)
          .map(async (id): Promise<PersonSafety> => {
            const { userKey, devices, unvouched } = await look(id)
            const verified =
              (await store.get<string>(verifiedKey(id))) === identityOf(id, userKey, devices)
            return {
              userId: id,
              verified,
              newDevices: await unseen(id, unvouched),
              keyChanged: await changed(id, userKey),
            }
          }),
      )
      const here = await thisDevice()
      const own = await look(userId)
      const mine = await unseen(userId, own.unvouched)
      return { people, mine: mine.filter((device) => device.id !== here) }
    },

    /** The codes matched: remember who they are (and take their devices as they are now). */
    verify: async (id: string) => {
      const { userKey, devices } = await look(id)
      await store.set(verifiedKey(id), identityOf(id, userKey, devices))
      await acknowledge(id)
    },

    /** The warnings were seen: stop showing them until something changes again. */
    acknowledge,
  }
}

export type Safety = ReturnType<typeof createSafety>
