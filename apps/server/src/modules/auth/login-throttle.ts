import type { Redis } from 'ioredis'

/** Attempts one login from one address (or one account's second factor) within the window. */
export const MAX_FAILED_LOGINS = 10
/**
 * Attempts one login may have from all addresses together: high enough that a stranger can't
 * lock the owner out from elsewhere, low enough to stop guessing spread over many addresses.
 */
export const MAX_FAILED_LOGINS_PER_ACCOUNT = 100
/** The window, which is also how long a lock lasts. */
export const LOCKOUT_SECONDS = 15 * 60

/**
 * Counts sign-in attempts per key, whatever address they come from — the per-IP limit
 * alone doesn't stop guessing from many addresses.
 *
 * An attempt is counted before it is checked (`take`), so simultaneous guesses can't all
 * slip past a "not locked yet" read; success then `reset`s the count.
 */
export interface LoginThrottle {
  /** Counts an attempt; false when the key is out of attempts (refuse without checking). */
  take(key: string, max?: number): Promise<boolean>
  reset(key: string): Promise<void>
  /** Clears a login everywhere: its overall count and every per-address one. */
  resetLogin(login: string): Promise<void>
}

/**
 * Passwords count per login as typed: tying username and email together would let a
 * lock reveal which email belongs to which name. Second factors count per account.
 */
export const loginThrottleKey = {
  login: (login: string) => `login:${login.trim().toLowerCase()}`,
  /** The same login from one address bucket (an IPv4 address or an IPv6 /64). */
  loginFrom: (login: string, bucket: string) => `login:${login.trim().toLowerCase()}:${bucket}`,
  mfa: (userId: string) => `mfa:${userId}`,
  /** Re-entering the password while signed in (password change, 2FA, account deletion). */
  reauth: (userId: string) => `reauth:${userId}`,
  /** One lockout email per login and window (the key expires with the lock). */
  lockoutMail: (login: string) => `lockout-mail:${login.trim().toLowerCase()}`,
}

const redisKey = (key: string) => `login-fail:${key}`
/** Glob characters in a login must match themselves in a SCAN pattern. */
const globEscape = (text: string) => text.replace(/[*?[\]\\]/g, '\\$&')

export const createRedisLoginThrottle = (redis: Redis): LoginThrottle => ({
  async take(key, max = MAX_FAILED_LOGINS) {
    // The window starts at the first attempt and isn't extended by later ones.
    const results = await redis
      .multi()
      .incr(redisKey(key))
      .expire(redisKey(key), LOCKOUT_SECONDS, 'NX')
      .exec()
    const count = Number(results?.[0]?.[1] ?? 0)
    return count <= max
  },
  async reset(key) {
    await redis.del(redisKey(key))
  },
  async resetLogin(login) {
    const overall = loginThrottleKey.login(login)
    const keys = [redisKey(overall)]
    let cursor = '0'
    do {
      const [next, found] = await redis.scan(
        cursor,
        'MATCH',
        `${globEscape(redisKey(overall))}:*`,
        'COUNT',
        500,
      )
      cursor = next
      keys.push(...found)
    } while (cursor !== '0')
    await redis.del(...keys)
  },
})

/** For a single process without Valkey (and unit tests). */
export const createMemoryLoginThrottle = (now: () => number = Date.now) => {
  const attempts = new Map<string, { count: number; until: number }>()
  // Unknown logins would otherwise pile up forever.
  const prune = (current: number) => {
    for (const [key, entry] of attempts) if (entry.until <= current) attempts.delete(key)
  }
  return {
    async take(key: string, max = MAX_FAILED_LOGINS) {
      const current = now()
      prune(current)
      const entry = attempts.get(key)
      const count = (entry?.count ?? 0) + 1
      attempts.set(key, { count, until: entry?.until ?? current + LOCKOUT_SECONDS * 1000 })
      return count <= max
    },
    async reset(key: string) {
      attempts.delete(key)
    },
    async resetLogin(login: string) {
      const overall = loginThrottleKey.login(login)
      for (const key of [...attempts.keys()]) {
        if (key === overall || key.startsWith(`${overall}:`)) attempts.delete(key)
      }
    },
    size: () => attempts.size,
  } satisfies LoginThrottle & { size: () => number }
}
