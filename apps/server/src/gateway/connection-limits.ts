import { addressBucket } from '../http/address-bucket'

/** Open connections of one user (tabs, devices) in this process. */
export const MAX_CONNECTIONS_PER_USER = 10
/** Open connections from one address (an IPv6 /64 counts as one): offices share an address. */
export const MAX_CONNECTIONS_PER_ADDRESS = 100
/** Sessions a user may start a minute: each IDENTIFY or RESUME builds state from the database. */
export const MAX_IDENTIFIES_PER_MINUTE = 20

const MINUTE_MS = 60_000

/** Gives the place back; calling it twice is harmless. */
export type Release = () => void

export interface ConnectionLimitOptions {
  readonly perUser?: number
  readonly perAddress?: number
  readonly identifiesPerMinute?: number
  readonly now?: () => number
}

/** Counts per key; `take` refuses at the cap. */
const createCounter = (max: number) => {
  const open = new Map<string, number>()
  return (key: string): Release | null => {
    const count = open.get(key) ?? 0
    if (count >= max) return null
    open.set(key, count + 1)
    let released = false
    return () => {
      if (released) return
      released = true
      const left = (open.get(key) ?? 1) - 1
      if (left > 0) open.set(key, left)
      else open.delete(key)
    }
  }
}

/**
 * Limits of the realtime gateway in this process: open connections per user and per address,
 * and how often a user starts a session. Without them one account could open hundreds of
 * connections, each with a full READY in memory. A cluster multiplies the caps by its size.
 */
export const createConnectionLimits = ({
  perUser = MAX_CONNECTIONS_PER_USER,
  perAddress = MAX_CONNECTIONS_PER_ADDRESS,
  identifiesPerMinute = MAX_IDENTIFIES_PER_MINUTE,
  now = Date.now,
}: ConnectionLimitOptions = {}) => {
  const users = createCounter(perUser)
  const addresses = createCounter(perAddress)
  const starts = new Map<string, number[]>()

  const startedRecently = (userId: string): boolean => {
    const since = now() - MINUTE_MS
    const recent = (starts.get(userId) ?? []).filter((at) => at > since)
    if (recent.length >= identifiesPerMinute) {
      starts.set(userId, recent)
      return true
    }
    starts.set(userId, [...recent, now()])
    return false
  }

  return {
    admitAddress: (address: string): Release | null => addresses(addressBucket(address)),

    /** A session for this user: refused at the open-connection cap or the start rate. */
    admitUser(userId: string): Release | null {
      const release = users(userId)
      if (!release) return null
      if (startedRecently(userId)) {
        release()
        return null
      }
      return release
    },
  }
}

export type ConnectionLimits = ReturnType<typeof createConnectionLimits>
