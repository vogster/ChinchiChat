import { ApiError } from '@chinchi/sdk'

import { commitmentOf } from './approval-crypto'

import type { E2eeApi } from './client'
import type { ApprovalState, Device, DeviceApproval } from '@chinchi/shared'

type ApprovalsApi = E2eeApi['e2ee']['approvals']

/**
 * The server's device approvals, in memory: the same steps and checks, and every change kept in
 * `events` for the test to hand to each client (as the gateway would).
 */
export const createFakeApprovals = (devices: readonly Device[], id: () => string) => {
  const approvals = new Map<string, DeviceApproval & { userId: string }>()
  const events: DeviceApproval[] = []

  const apiFor = (userId: string): ApprovalsApi => {
    const mine = (approvalId: string) => {
      const found = approvals.get(approvalId)
      if (found?.userId !== userId) throw new ApiError(404, 'UNKNOWN_APPROVAL', 'Unknown approval')
      return found
    }
    const move = (approvalId: string, from: ApprovalState[], change: Partial<DeviceApproval>) => {
      const found = mine(approvalId)
      if (!from.includes(found.state)) throw new ApiError(409, 'APPROVAL_STATE', found.state)
      const next = { ...found, ...change }
      approvals.set(approvalId, next)
      const { userId: _owner, ...approval } = next
      events.push(approval)
      return { approval }
    }
    const device = (deviceId: string) =>
      devices.find((d) => d.id === deviceId && d.userId === userId)

    return {
      request: async ({ deviceId, commitment }) => {
        if (device(deviceId)?.userSignature) {
          throw new ApiError(409, 'DEVICE_ALREADY_APPROVED', 'Already approved')
        }
        const approval: DeviceApproval = {
          id: id(),
          newDeviceId: deviceId,
          commitment,
          newKey: null,
          approverDeviceId: null,
          approverKey: null,
          secrets: null,
          state: 'requested',
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        }
        approvals.set(approval.id, { ...approval, userId })
        events.push(approval)
        return { approval }
      },
      get: async (approvalId) => {
        const { userId: _owner, ...approval } = mine(approvalId)
        return { approval }
      },
      accept: async (approvalId, { deviceId, publicKey }) => {
        if (!device(deviceId)?.userSignature) {
          throw new ApiError(409, 'DEVICE_NOT_APPROVED', 'Not approved')
        }
        return move(approvalId, ['requested'], {
          state: 'accepted',
          approverDeviceId: deviceId,
          approverKey: publicKey,
        })
      },
      reveal: async (approvalId, publicKey) => {
        if ((await commitmentOf(publicKey)) !== mine(approvalId).commitment) {
          throw new ApiError(409, 'COMMITMENT_MISMATCH', 'Mismatch')
        }
        return move(approvalId, ['accepted'], { state: 'revealed', newKey: publicKey })
      },
      complete: async (approvalId, secrets) =>
        move(approvalId, ['revealed'], { state: 'completed', secrets }),
      decline: async (approvalId) => {
        move(approvalId, ['requested', 'accepted', 'revealed'], { state: 'declined' })
      },
    }
  }

  return { apiFor, events }
}
