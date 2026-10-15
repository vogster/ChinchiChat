import { randomBytes } from 'node:crypto'

import type { Redis } from 'ioredis'

/** How long a dropped session stays resumable. */
export const RESUME_WINDOW_SECONDS = 120

const key = (sessionId: string) => `chinchi:gw:session:${sessionId}`

export interface GatewaySession {
  readonly userId: string
  /**
   * The oldest position a RESUME may start from: where READY left off, raised as the client
   * confirms what it has seen. Anything older was never this session's to receive.
   */
  readonly floor: number
}

const parse = (raw: string | null): GatewaySession | null => {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<GatewaySession>
    return typeof value.userId === 'string' && typeof value.floor === 'number'
      ? { userId: value.userId, floor: value.floor }
      : null
  } catch {
    return null
  }
}

/** Gateway sessions: whose a resumable session id is, and how far back it may replay. */
export const createGatewaySessionStore = (redis: Redis) => ({
  async create(userId: string, floor: number): Promise<string> {
    const sessionId = randomBytes(16).toString('hex')
    await redis.set(key(sessionId), JSON.stringify({ userId, floor }), 'EX', RESUME_WINDOW_SECONDS)
    return sessionId
  },

  async get(sessionId: string): Promise<GatewaySession | null> {
    return parse(await redis.get(key(sessionId)))
  },

  /** Keeps the session resumable; a newer confirmed position raises its floor. */
  async touch(sessionId: string, seen?: number): Promise<void> {
    const current = seen === undefined ? null : parse(await redis.get(key(sessionId)))
    if (current && seen !== undefined && seen > current.floor) {
      await redis.set(
        key(sessionId),
        JSON.stringify({ ...current, floor: seen }),
        'EX',
        RESUME_WINDOW_SECONDS,
      )
      return
    }
    await redis.expire(key(sessionId), RESUME_WINDOW_SECONDS)
  },
})

export type GatewaySessionStore = ReturnType<typeof createGatewaySessionStore>
