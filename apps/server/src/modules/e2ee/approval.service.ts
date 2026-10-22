import { createHash } from 'node:crypto'
import { APPROVAL_SECONDS } from '@chinchi/shared'

import { userTopic } from '../../events/event-bus'
import { conflict, HttpError } from '../../http/http-error'

import type { EventBus } from '../../events/event-bus'
import type { ApprovalStore, StoredApproval } from './approval.store'
import type { E2eeRepository } from './e2ee.repository'
import type { ApprovalState, DeviceApproval, Snowflake } from '@chinchi/shared'

export interface ApprovalServiceDeps {
  readonly approvals: ApprovalStore
  readonly e2ee: Pick<E2eeRepository, 'findDevice'>
  readonly events: EventBus
  readonly nextId: () => Snowflake
  readonly now?: () => Date
}

const unknownApproval = () => new HttpError(404, 'UNKNOWN_APPROVAL', 'Unknown approval')
const unknownDevice = () => new HttpError(404, 'UNKNOWN_DEVICE', 'Unknown device')

const toApproval = ({ userId: _userId, ...approval }: StoredApproval): DeviceApproval => approval

/**
 * Relays a device approval between a new device and an approved one. It checks only who may
 * take each step and that the new device reveals the key it committed to; the secrets passed at
 * the end are encrypted for the new device.
 */
export const createApprovalService = ({
  approvals,
  e2ee,
  events,
  nextId,
  now = () => new Date(),
}: ApprovalServiceDeps) => {
  const ownDevice = async (userId: Snowflake, deviceId: Snowflake) => {
    const device = await e2ee.findDevice(deviceId)
    if (device?.userId !== userId || device.revokedAt) throw unknownDevice()
    return device
  }

  const mine = async (userId: Snowflake, id: Snowflake) => {
    const approval = await approvals.find(id)
    if (approval?.userId !== userId) throw unknownApproval()
    return approval
  }

  const move = async (
    approval: StoredApproval,
    from: readonly ApprovalState[],
    change: Partial<StoredApproval>,
  ): Promise<DeviceApproval> => {
    if (!from.includes(approval.state)) {
      throw conflict('APPROVAL_STATE', `The approval is ${approval.state}`)
    }
    const next = { ...approval, ...change }
    if (!(await approvals.replace(approval, next))) {
      throw conflict('APPROVAL_STATE', 'The approval changed meanwhile')
    }
    await announce(next)
    return toApproval(next)
  }

  const announce = (approval: StoredApproval) =>
    events.publish({
      topic: userTopic(approval.userId),
      type: 'E2EE_APPROVAL_UPDATE',
      data: toApproval(approval),
    })

  return {
    /** An unsigned device of mine asks to be approved. */
    async request(
      userId: Snowflake,
      { deviceId, commitment }: { deviceId: Snowflake; commitment: string },
    ): Promise<DeviceApproval> {
      const device = await ownDevice(userId, deviceId)
      if (device.userSignature) {
        throw conflict('DEVICE_ALREADY_APPROVED', 'This device is already approved')
      }
      const approval: StoredApproval = {
        id: nextId(),
        userId,
        newDeviceId: deviceId,
        commitment,
        newKey: null,
        approverDeviceId: null,
        approverKey: null,
        secrets: null,
        state: 'requested',
        expiresAt: new Date(now().getTime() + APPROVAL_SECONDS * 1000).toISOString(),
      }
      await approvals.create(approval)
      await announce(approval)
      return toApproval(approval)
    },

    get: async (userId: Snowflake, id: Snowflake): Promise<DeviceApproval> =>
      toApproval(await mine(userId, id)),

    /** An approved device of mine answers with its ephemeral key. */
    async accept(
      userId: Snowflake,
      id: Snowflake,
      { deviceId, publicKey }: { deviceId: Snowflake; publicKey: string },
    ): Promise<DeviceApproval> {
      const approval = await mine(userId, id)
      const device = await ownDevice(userId, deviceId)
      if (!device.userSignature || device.id === approval.newDeviceId) {
        throw conflict('DEVICE_NOT_APPROVED', 'Only an approved device can approve another')
      }
      return move(approval, ['requested'], {
        state: 'accepted',
        approverDeviceId: deviceId,
        approverKey: publicKey,
      })
    },

    /** The new device reveals the key it committed to. */
    async reveal(userId: Snowflake, id: Snowflake, publicKey: string): Promise<DeviceApproval> {
      const approval = await mine(userId, id)
      const digest = createHash('sha256').update(Buffer.from(publicKey, 'base64')).digest('base64')
      if (digest !== approval.commitment) {
        throw conflict('COMMITMENT_MISMATCH', 'This is not the key the device committed to')
      }
      return move(approval, ['accepted'], { state: 'revealed', newKey: publicKey })
    },

    /** The emoji matched: the approver hands over the encrypted secrets. */
    async complete(userId: Snowflake, id: Snowflake, secrets: string): Promise<DeviceApproval> {
      return move(await mine(userId, id), ['revealed'], { state: 'completed', secrets })
    },

    async decline(userId: Snowflake, id: Snowflake): Promise<void> {
      await move(await mine(userId, id), ['requested', 'accepted', 'revealed'], {
        state: 'declined',
      })
    },
  }
}

export type ApprovalService = ReturnType<typeof createApprovalService>
