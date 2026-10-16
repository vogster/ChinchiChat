import { ApiError } from '@chinchi/sdk'

import { agree, commitmentOf, createEphemeral, openSecrets, sealSecrets } from './approval-crypto'

import type { Ephemeral } from './approval-crypto'
import type { E2eeApi } from './client'
import type { CrossSigning } from './cross-signing'
import type { HistoryBackup } from './history-backup'
import type { DeviceKeys } from '@chinchi/e2ee'
import type { DeviceApproval } from '@chinchi/shared'

/** What the screen shows of one approval, on the new device or on the one approving it. */
export interface ApprovalView {
  readonly approvalId: string
  readonly role: 'new' | 'approver'
  /** On the approver: the new device's name. */
  readonly deviceName: string | null
  /** waiting: for another device to answer; compare: emoji are up; done / declined: over. */
  readonly state: 'waiting' | 'compare' | 'done' | 'declined'
  readonly emoji: readonly string[] | null
}

export interface DeviceApprovalDeps {
  readonly api: E2eeApi
  readonly ready: () => Promise<DeviceKeys>
  readonly crossSigning: CrossSigning
  readonly backup: HistoryBackup
}

interface Session {
  readonly ephemeral: Ephemeral
  /** Steps taken, so a change seen twice (response and gateway) is acted on once. */
  revealed?: boolean
  secretKey?: CryptoKey
}

/**
 * Approving a new device from an approved one. The new device commits to its key; an approved
 * device answers with its own; the new one reveals; both show emoji from the shared secret; the
 * user says yes on the approver, which hands over the recovery key — the new device takes the
 * user key and history with it, like typing the key in.
 */
export const createDeviceApproval = ({ api, ready, crossSigning, backup }: DeviceApprovalDeps) => {
  const sessions = new Map<string, Session>()
  const views = new Map<string, ApprovalView>()
  const listeners = new Set<() => void>()
  /** The same array until something changes (screens subscribe to it). */
  let snapshot: ApprovalView[] = []
  const notify = () => {
    snapshot = [...views.values()]
    for (const listener of listeners) listener()
  }

  const show = (approvalId: string, change: Partial<ApprovalView>) => {
    const view = views.get(approvalId)
    if (!view) return
    views.set(approvalId, { ...view, ...change })
    notify()
  }

  const transcript = (approval: DeviceApproval) => ({
    approvalId: approval.id,
    newDeviceId: approval.newDeviceId,
    approverDeviceId: approval.approverDeviceId ?? '',
    newKey: approval.newKey ?? '',
    approverKey: approval.approverKey ?? '',
  })

  /** As the new device. */
  const asNew = async (approval: DeviceApproval, session: Session) => {
    if (approval.state === 'accepted' && !session.revealed && approval.approverKey) {
      session.revealed = true
      const { approval: revealed } = await api.e2ee.approvals.reveal(
        approval.id,
        session.ephemeral.publicKey,
      )
      await asNew(revealed, session)
    } else if (approval.state === 'revealed' && !session.secretKey && approval.approverKey) {
      const agreed = await agree(
        session.ephemeral.privateKey,
        approval.approverKey,
        transcript(approval),
      )
      session.secretKey = agreed.secretKey
      show(approval.id, { state: 'compare', emoji: agreed.emoji })
    } else if (approval.state === 'completed' && approval.secrets) {
      if (!session.secretKey) await asNew({ ...approval, state: 'revealed' }, session)
      const secrets = session.secretKey
        ? await openSecrets(session.secretKey, approval.secrets)
        : null
      const result = secrets ? await backup.useKey(secrets.recoveryKey, await ready()) : 'wrong'
      sessions.delete(approval.id)
      show(approval.id, { state: result === 'ok' ? 'done' : 'declined' })
    } else if (approval.state === 'declined') {
      sessions.delete(approval.id)
      show(approval.id, { state: 'declined' })
    }
  }

  /** As an approved device that can vouch for others. */
  const asApprover = async (approval: DeviceApproval, here: string) => {
    if (approval.state === 'requested' && !sessions.has(approval.id)) {
      if (!(await crossSigning.held()) || !(await backup.key())) return
      const ephemeral = await createEphemeral()
      sessions.set(approval.id, { ephemeral })
      // Fresh: the new device registered moments ago, after any list this client cached.
      const { devices } = await api.e2ee.myDevices()
      const name = devices.find((d) => d.id === approval.newDeviceId)?.name
      views.set(approval.id, {
        approvalId: approval.id,
        role: 'approver',
        deviceName: name ?? null,
        state: 'waiting',
        emoji: null,
      })
      try {
        await api.e2ee.approvals.accept(approval.id, {
          deviceId: here,
          publicKey: ephemeral.publicKey,
        })
      } catch (error) {
        // Another of my devices answered first: it shows the emoji, this one steps back.
        if (!(error instanceof ApiError && error.status === 409)) throw error
        sessions.delete(approval.id)
        views.delete(approval.id)
      }
      notify()
      return
    }
    const session = sessions.get(approval.id)
    if (!session) return
    if (approval.state === 'revealed' && approval.newKey && !session.secretKey) {
      // The relay must not swap the new device's key after seeing mine.
      if ((await commitmentOf(approval.newKey)) !== approval.commitment) {
        await api.e2ee.approvals.decline(approval.id)
        return
      }
      const agreed = await agree(
        session.ephemeral.privateKey,
        approval.newKey,
        transcript(approval),
      )
      session.secretKey = agreed.secretKey
      show(approval.id, { state: 'compare', emoji: agreed.emoji })
    } else if (approval.state === 'completed' || approval.state === 'declined') {
      sessions.delete(approval.id)
      show(approval.id, { state: approval.state === 'completed' ? 'done' : 'declined' })
    }
  }

  return {
    /** This device asks one of the user's approved devices to vouch for it. */
    request: async (): Promise<string> => {
      const device = await ready()
      const ephemeral = await createEphemeral()
      const { approval } = await api.e2ee.approvals.request({
        deviceId: device.identity.deviceId,
        commitment: await commitmentOf(ephemeral.publicKey),
      })
      sessions.set(approval.id, { ephemeral })
      views.set(approval.id, {
        approvalId: approval.id,
        role: 'new',
        deviceName: null,
        state: 'waiting',
        emoji: null,
      })
      notify()
      return approval.id
    },

    /** A change from the gateway (or a response): moves this device's part along. */
    handle: async (approval: DeviceApproval): Promise<void> => {
      const here = (await ready()).identity.deviceId
      if (approval.newDeviceId === here) {
        const session = sessions.get(approval.id)
        if (session) await asNew(approval, session)
        return
      }
      await asApprover(approval, here)
    },

    /** The emoji matched (the user said so): hand over the recovery key. */
    confirm: async (approvalId: string): Promise<void> => {
      const session = sessions.get(approvalId)
      const recoveryKey = await backup.key()
      if (!session?.secretKey || !recoveryKey) return
      await api.e2ee.approvals.complete(
        approvalId,
        await sealSecrets(session.secretKey, { recoveryKey }),
      )
    },

    decline: async (approvalId: string): Promise<void> => {
      await api.e2ee.approvals.decline(approvalId)
    },

    /** Forgets an approval that is over (the dialog was closed). */
    dismiss: (approvalId: string) => {
      views.delete(approvalId)
      notify()
    },

    views: (): ApprovalView[] => snapshot,

    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export type DeviceApprovals = ReturnType<typeof createDeviceApproval>
