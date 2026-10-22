import { APPROVAL_SECONDS } from '@chinchi/shared'

import type { DeviceApproval, Snowflake } from '@chinchi/shared'
import type { Redis } from 'ioredis'

/** A device approval with its owner; it lives only for `APPROVAL_SECONDS`. */
export interface StoredApproval extends DeviceApproval {
  readonly userId: Snowflake
}

export interface ApprovalStore {
  create(approval: StoredApproval): Promise<void>
  find(id: Snowflake): Promise<StoredApproval | null>
  /**
   * Saves a change, keeping the original expiry, only if the approval is still as it was read:
   * of two devices answering at once, only one gets it. False when it changed meanwhile.
   */
  replace(previous: StoredApproval, next: StoredApproval): Promise<boolean>
}

const key = (id: Snowflake) => `e2ee-approval:${id}`

/** Sets the key to ARGV[2] (keeping its expiry) only while it still holds ARGV[1]. */
const REPLACE_IF = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'KEEPTTL')
return 1`

export const createRedisApprovalStore = (redis: Redis): ApprovalStore => ({
  async create(approval) {
    await redis.set(key(approval.id), JSON.stringify(approval), 'EX', APPROVAL_SECONDS)
  },
  async find(id) {
    const raw = await redis.get(key(id))
    return raw ? (JSON.parse(raw) as StoredApproval) : null
  },
  async replace(previous, next) {
    // What find() parsed stringifies back to the stored text: same keys, same order.
    const replaced = await redis.eval(
      REPLACE_IF,
      1,
      key(previous.id),
      JSON.stringify(previous),
      JSON.stringify(next),
    )
    return replaced === 1
  },
})

/** For a single process without Valkey (and unit tests). */
export const createMemoryApprovalStore = (now: () => number = Date.now): ApprovalStore => {
  const approvals = new Map<Snowflake, StoredApproval>()
  const alive = (approval: StoredApproval | undefined) =>
    approval && Date.parse(approval.expiresAt) > now() ? approval : null
  return {
    async create(approval) {
      approvals.set(approval.id, approval)
    },
    find: async (id) => alive(approvals.get(id)),
    async replace(previous, next) {
      const current = alive(approvals.get(previous.id))
      if (!current || JSON.stringify(current) !== JSON.stringify(previous)) return false
      approvals.set(previous.id, next)
      return true
    },
  }
}
