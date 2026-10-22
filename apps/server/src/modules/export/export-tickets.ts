import { generateSessionToken, hashSessionToken } from '../auth/session-token'

import type { Snowflake } from '@chinchi/shared'
import type { Redis } from 'ioredis'

/** The download starts right after the password: a ticket need not live long. */
export const EXPORT_TICKET_SECONDS = 2 * 60

/**
 * One download of a user's data after they typed their password. The ticket travels in the
 * download URL (a browser download can't carry a body), so it works once and only briefly.
 */
export interface ExportTickets {
  create(userId: Snowflake): Promise<string>
  /** Whose ticket it was; it is spent either way. */
  take(ticket: string): Promise<Snowflake | null>
}

const key = (ticket: string) => `export-ticket:${hashSessionToken(ticket)}`

export const createRedisExportTickets = (redis: Redis): ExportTickets => ({
  async create(userId) {
    const { token } = generateSessionToken()
    await redis.set(key(token), userId, 'EX', EXPORT_TICKET_SECONDS)
    return token
  },
  take: (ticket) => redis.getdel(key(ticket)),
})

/** For a single process without Valkey. */
export const createMemoryExportTickets = (now: () => number = Date.now): ExportTickets => {
  const tickets = new Map<string, { userId: Snowflake; until: number }>()
  return {
    async create(userId) {
      const { token } = generateSessionToken()
      tickets.set(key(token), { userId, until: now() + EXPORT_TICKET_SECONDS * 1000 })
      return token
    },
    async take(ticket) {
      const entry = tickets.get(key(ticket))
      tickets.delete(key(ticket))
      return entry && entry.until > now() ? entry.userId : null
    },
  }
}
