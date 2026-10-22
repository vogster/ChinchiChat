import { QR_LOGIN_SECONDS } from '@chinchi/shared'

import type { Snowflake } from '@chinchi/shared'
import type { Redis } from 'ioredis'

/** A sign-in waiting to be approved from a signed-in device (lives `QR_LOGIN_SECONDS`). */
export interface QrLogin {
  readonly id: string
  /** Normalised short code: 8 Crockford base32 characters, no dash. */
  readonly code: string
  /** SHA-256 of the secret only the new device has; it alone claims the session. */
  readonly secretHash: string
  readonly publicKey: string | null
  /** The number the new device shows, and it among the decoys the approver picks from. */
  readonly match: number
  readonly choices: readonly number[]
  /** The approver opened it: the new device may show the number now. */
  readonly seen: boolean
  readonly userAgent: string | null
  readonly ipAddress: string | null
  readonly createdAt: string
  /** Who said yes; null while waiting. */
  readonly approvedBy: Snowflake | null
  readonly sealed: string | null
  readonly approverKey: string | null
}

export interface QrLoginStore {
  create(login: QrLogin): Promise<void>
  find(id: string): Promise<QrLogin | null>
  findByCode(code: string): Promise<QrLogin | null>
  /** Saves a change, keeping the time left. */
  update(login: QrLogin): Promise<void>
  delete(login: QrLogin): Promise<void>
}

const key = (id: string) => `qr-login:${id}`
const codeKey = (code: string) => `qr-login-code:${code}`

/** Shared by every server process; the keys expire by themselves. */
export const createRedisQrLoginStore = (redis: Redis): QrLoginStore => {
  const find = async (id: string) => {
    const raw = await redis.get(key(id))
    return raw ? (JSON.parse(raw) as QrLogin) : null
  }
  return {
    async create(login) {
      await redis
        .multi()
        .set(key(login.id), JSON.stringify(login), 'EX', QR_LOGIN_SECONDS)
        .set(codeKey(login.code), login.id, 'EX', QR_LOGIN_SECONDS)
        .exec()
    },
    find,
    async findByCode(code) {
      const id = await redis.get(codeKey(code))
      return id ? find(id) : null
    },
    async update(login) {
      await redis.set(key(login.id), JSON.stringify(login), 'KEEPTTL')
    },
    async delete(login) {
      await redis.del(key(login.id), codeKey(login.code))
    },
  }
}

/** For a single process without Valkey (and unit tests). */
export const createMemoryQrLoginStore = (now: () => number = Date.now): QrLoginStore => {
  const logins = new Map<string, { login: QrLogin; until: number }>()
  const find = async (id: string) => {
    const entry = logins.get(id)
    return entry && entry.until > now() ? entry.login : null
  }
  return {
    async create(login) {
      logins.set(login.id, { login, until: now() + QR_LOGIN_SECONDS * 1000 })
    },
    find,
    async findByCode(code) {
      const entry = [...logins.values()].find((e) => e.login.code === code)
      return entry ? find(entry.login.id) : null
    },
    async update(login) {
      const entry = logins.get(login.id)
      if (entry) logins.set(login.id, { ...entry, login })
    },
    async delete(login) {
      logins.delete(login.id)
    },
  }
}
