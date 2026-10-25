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
  /**
   * asked (approver): a new sign-in, nothing sent until the person picks this device to compare
   * on; waiting: for the other device; compare: emoji are up; elsewhere (approver): another of my
   * devices answered first; done / declined: over.
   */
  readonly state: 'asked' | 'waiting' | 'compare' | 'elsewhere' | 'done' | 'declined'
  readonly emoji: readonly string[] | null
  /** On the new device: the person said here that the emoji match. */
  readonly confirmedHere?: boolean
  /** On the new device: the device that answered said yes (its keys wait for this one's yes). */
  readonly approvedThere?: boolean
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
  /** New device: the person said here that the emoji match. */
  confirmed?: boolean
  /** New device: the sealed keys that came, kept until the person here says yes. */
  sealed?: string
}

/**
 * Approving a new device from an approved one. The new device commits to its key; every approved
 * device asks the person, and the one they pick answers with its own (the server lets only one
 * answer); the new one reveals; both show emoji from the shared secret. The
 * user says yes on the approver, which hands over the recovery key, and yes on the new device,
 * which only then takes the user key and history with it, like typing the key in. Both yeses
 * count: whoever answered the new device may be the server posing as an approved one (it relays
 * every message), and only the person comparing the two screens can tell.
 */
export const createDeviceApproval = ({ api, ready, crossSigning, backup }: DeviceApprovalDeps) => {
  const sessions = new Map<string, Session>()
  /** Approvals this device has asked the person about (the gateway may repeat a request). */
  const asked = new Set<string>()
  /** Asked about, then answered elsewhere or over while this device was still looking it up. */
  const gone = new Set<string>()
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

  /** New device, both yeses in: opens the keys that came and takes them. */
  const take = async (approvalId: string, session: Session) => {
    if (sessions.get(approvalId) !== session) return
    sessions.delete(approvalId)
    const secrets =
      session.secretKey && session.sealed
        ? await openSecrets(session.secretKey, session.sealed)
        : null
    const result = secrets ? await backup.useKey(secrets.recoveryKey, await ready()) : 'wrong'
    show(approvalId, { state: result === 'ok' ? 'done' : 'declined' })
  }

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
      session.sealed = approval.secrets
      if (session.confirmed) await take(approval.id, session)
      else show(approval.id, { approvedThere: true })
    } else if (approval.state === 'declined') {
      sessions.delete(approval.id)
      show(approval.id, { state: 'declined' })
    }
  }

  /** Closes this device's question: another device has it, or it is over. */
  const forget = (approvalId: string) => {
    sessions.delete(approvalId)
    views.delete(approvalId)
    notify()
  }

  /** As an approved device that can vouch for others. */
  const asApprover = async (approval: DeviceApproval, here: string) => {
    if (approval.state === 'requested') {
      if (asked.has(approval.id)) return
      asked.add(approval.id)
      if (!(await crossSigning.held()) || !(await backup.key())) return
      // Fresh: the new device registered moments ago, after any list this client cached.
      const { devices } = await api.e2ee.myDevices()
      const name = devices.find((d) => d.id === approval.newDeviceId)?.name
      if (gone.has(approval.id)) return
      views.set(approval.id, {
        approvalId: approval.id,
        role: 'approver',
        deviceName: name ?? null,
        state: 'asked',
        emoji: null,
      })
      notify()
      return
    }
    const view = views.get(approval.id)
    if (!view) {
      if (asked.has(approval.id)) gone.add(approval.id)
      return
    }
    if (view.state === 'elsewhere') return
    const session = sessions.get(approval.id)
    if (!session) {
      // Not picked here: anything after the request means a device answered (another tab of
      // this one, too) or it is over, so the question goes.
      forget(approval.id)
      return
    }
    // Picked here, but another of my devices answered: its emoji are the ones to compare.
    if (approval.approverDeviceId && approval.approverDeviceId !== here) {
      sessions.delete(approval.id)
      show(approval.id, { state: 'elsewhere' })
      return
    }
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

    /**
     * On an approved device: the person picked this one to compare emoji on. Only now does it
     * answer the new device; if another answered first, it says so and steps back.
     */
    compareHere: async (approvalId: string): Promise<void> => {
      const view = views.get(approvalId)
      if (view?.role !== 'approver' || view.state !== 'asked' || sessions.has(approvalId)) return
      const ephemeral = await createEphemeral()
      sessions.set(approvalId, { ephemeral })
      show(approvalId, { state: 'waiting' })
      try {
        await api.e2ee.approvals.accept(approvalId, {
          deviceId: (await ready()).identity.deviceId,
          publicKey: ephemeral.publicKey,
        })
      } catch (error) {
        sessions.delete(approvalId)
        if (!(error instanceof ApiError && error.status === 409)) {
          show(approvalId, { state: 'asked' })
          throw error
        }
        show(approvalId, { state: 'elsewhere' })
      }
    },

    /**
     * The emoji matched (the user said so). On the approver: hand over the recovery key. On the
     * new device: take the keys, now or as soon as the approver's yes brings them.
     */
    confirm: async (approvalId: string): Promise<void> => {
      const session = sessions.get(approvalId)
      if (!session?.secretKey) return
      if (views.get(approvalId)?.role === 'new') {
        session.confirmed = true
        if (session.sealed) await take(approvalId, session)
        else show(approvalId, { confirmedHere: true })
        return
      }
      const recoveryKey = await backup.key()
      if (!recoveryKey) return
      await api.e2ee.approvals.complete(
        approvalId,
        await sealSecrets(session.secretKey, { recoveryKey }),
      )
    },

    /** No (the emoji differ, or it wasn't me): stops it; a new device takes nothing it got. */
    decline: async (approvalId: string): Promise<void> => {
      if (views.get(approvalId)?.role === 'new') {
        sessions.delete(approvalId)
        show(approvalId, { state: 'declined' })
      }
      try {
        await api.e2ee.approvals.decline(approvalId)
      } catch (error) {
        // Already completed by the other side: what it sent is simply never opened here.
        if (!(error instanceof ApiError && error.status === 409)) throw error
      }
    },

    /**
     * New device: stops asking (no device was picked to compare on, or the person changed their
     * mind) and goes back to the start; the old devices close the question.
     */
    cancel: async (approvalId: string): Promise<void> => {
      sessions.delete(approvalId)
      views.delete(approvalId)
      notify()
      try {
        await api.e2ee.approvals.decline(approvalId)
      } catch (error) {
        // Already over (completed or expired): nothing left to stop.
        if (!(error instanceof ApiError && error.status === 409)) throw error
      }
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
