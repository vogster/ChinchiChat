import { generateSessionToken, hashSessionToken } from './session-token'

import type { Snowflake } from '@chinchi/shared'
import type { Redis } from 'ioredis'

/** How long the second step of a sign-in may take. */
export const MFA_TICKET_SECONDS = 5 * 60

/** Remembers that a password was right while the sign-in waits for the second factor. */
export interface MfaTickets {
  create(userId: Snowflake): Promise<string>
  find(ticket: string): Promise<Snowflake | null>
  revoke(ticket: string): Promise<void>
}

const key = (ticket: string) => `mfa-ticket:${hashSessionToken(ticket)}`

export const createRedisMfaTickets = (redis: Redis): MfaTickets => ({
  async create(userId) {
    const { token } = generateSessionToken()
    await redis.set(key(token), userId, 'EX', MFA_TICKET_SECONDS)
    return token
  },
  find: (ticket) => redis.get(key(ticket)),
  async revoke(ticket) {
    await redis.del(key(ticket))
  },
})

/** For a single process without Valkey (and unit tests). */
export const createMemoryMfaTickets = (now: () => number = Date.now): MfaTickets => {
  const tickets = new Map<string, { userId: Snowflake; until: number }>()
  return {
    async create(userId) {
      const { token } = generateSessionToken()
      tickets.set(key(token), { userId, until: now() + MFA_TICKET_SECONDS * 1000 })
      return token
    },
    async find(ticket) {
      const entry = tickets.get(key(ticket))
      return entry && entry.until > now() ? entry.userId : null
    },
    async revoke(ticket) {
      tickets.delete(key(ticket))
    },
  }
}
