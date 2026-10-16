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
  /** Saves a change, keeping the original expiry. */
  update(approval: StoredApproval): Promise<void>
}

const key = (id: Snowflake) => `e2ee-approval:${id}`

export const createRedisApprovalStore = (redis: Redis): ApprovalStore => ({
  async create(approval) {
    await redis.set(key(approval.id), JSON.stringify(approval), 'EX', APPROVAL_SECONDS)
  },
  async find(id) {
    const raw = await redis.get(key(id))
    return raw ? (JSON.parse(raw) as StoredApproval) : null
  },
  async update(approval) {
    await redis.set(key(approval.id), JSON.stringify(approval), 'KEEPTTL')
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
    async update(approval) {
      if (alive(approvals.get(approval.id))) approvals.set(approval.id, approval)
    },
  }
}
