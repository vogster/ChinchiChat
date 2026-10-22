import {
  epoch,
  joinConversation,
  loadConversation,
  members,
  ownIdentity,
  processIncoming,
  saveConversation,
} from '@chinchi/e2ee'
import { ApiError } from '@chinchi/sdk'

import { fromBase64, toBase64 } from './codec'
import { exclusively } from './web-locks'

import type { E2eeApi } from './client-types'
import type { GroupMembership } from './group-membership'
import type { KeyPackages } from './key-packages'
import type { E2eeStore } from './store'
import type { Conversation, ConversationOptions, DeviceKeys } from '@chinchi/e2ee'
import type { Handshake } from '@chinchi/shared'

interface StoredConversation {
  /** Saved MLS state; absent while waiting for a Welcome. */
  readonly state?: string
  /** The last handshake already applied (or skipped). */
  readonly cursor?: string
}

/** A commit made here, ready to post: the new state, the commit, and a Welcome for new devices. */
export interface MadeCommit {
  readonly conversation: Conversation
  readonly commit: Uint8Array
  readonly welcome?: Uint8Array
}

/** The people (user ids) with a device in the conversation. */
export const peopleIn = (conversation: Conversation) => [
  ...new Set(members(conversation).map((m) => m.identity.userId)),
]

/** Whether this device is still in the conversation, as this very device (its own leaf). */
const isOwn = (conversation: Conversation, keys: DeviceKeys) => {
  const own = ownIdentity(conversation)
  return own?.deviceId === keys.identity.deviceId && own.userId === keys.identity.userId
}

const isStale = (error: unknown) => error instanceof ApiError && error.code === 'STALE_EPOCH'

/**
 * The MLS state of each conversation on this device: kept in the store, moved along by the
 * handshakes the server orders, and by commits made here.
 */
export const createConversationStore = ({
  api,
  store,
  userId,
  options,
  keyPackages,
  membership,
}: {
  api: E2eeApi
  store: E2eeStore
  userId: string
  options: ConversationOptions
  keyPackages: KeyPackages
  membership: GroupMembership
}) => {
  const conversations = new Map<string, Conversation>()
  const queues = new Map<string, Promise<unknown>>()

  /**
   * One operation at a time per conversation, across this browser's tabs too: MLS state moves in
   * a line. Each starts from the stored state, which another tab may have moved on meanwhile.
   */
  const serial = <T>(channelId: string, task: () => Promise<T>): Promise<T> => {
    const locked = () =>
      exclusively(`chinchi-e2ee-conversation:${userId}:${channelId}`, () => {
        conversations.delete(channelId)
        return task()
      })
    const run = (queues.get(channelId) ?? Promise.resolve()).then(locked, locked)
    queues.set(
      channelId,
      run.catch(() => undefined),
    )
    return run
  }

  const loadState = async (channelId: string): Promise<StoredConversation> =>
    (await store.get<StoredConversation>(`conv:${channelId}`)) ?? {}

  const conversationOf = async (
    channelId: string,
    keys: DeviceKeys,
  ): Promise<Conversation | null> => {
    const live = conversations.get(channelId)
    if (live) return live
    const { state } = await loadState(channelId)
    if (!state) return null
    const loaded = loadConversation(fromBase64(state), options)
    // State of another device (one removed and registered anew here) is of no use: in it this
    // device would commit as someone else. Dropped with its cursor, it waits to be let in.
    if (!isOwn(loaded, keys)) {
      await store.delete(`conv:${channelId}`)
      return null
    }
    conversations.set(channelId, loaded)
    return loaded
  }

  const persist = async (channelId: string, conversation: Conversation | null, cursor?: string) => {
    if (conversation) conversations.set(channelId, conversation)
    else conversations.delete(channelId)
    const previous = await loadState(channelId)
    await store.set(`conv:${channelId}`, {
      ...(conversation ? { state: toBase64(saveConversation(conversation)) } : {}),
      ...((cursor ?? previous.cursor) ? { cursor: cursor ?? previous.cursor } : {}),
    } satisfies StoredConversation)
  }

  /** Joins from a Welcome with whichever of this device's key packages it was made for. */
  const join = async (welcome: Handshake): Promise<Conversation | null> => {
    for (const { stored, bundle } of await keyPackages.bundles()) {
      try {
        const joined = await joinConversation(fromBase64(welcome.payload), bundle, options)
        await keyPackages.spend(stored)
        return joined
      } catch {
        // Not the package this Welcome was made for: try the next one.
      }
    }
    return null
  }

  /** Applies the handshakes this device has not seen yet, in the server's order. */
  const sync = async (channelId: string, keys: DeviceKeys) => {
    // First: a state that isn't this device's goes, and its cursor with it.
    let conversation = await conversationOf(channelId, keys)
    const { cursor } = await loadState(channelId)
    const { handshakes } = await api.e2ee.handshakes(channelId, {
      deviceId: keys.identity.deviceId,
      ...(cursor ? { after: cursor } : {}),
    })
    let last = cursor
    for (const handshake of handshakes) {
      last = handshake.id
      if (!conversation) {
        if (handshake.kind === 'welcome') conversation = await join(handshake)
        if (conversation) {
          await membership.begin(channelId, peopleIn(conversation))
          await keyPackages.refill(keys).catch(() => undefined)
        }
        continue
      }
      // Commits made from an earlier epoch are already in (our own, or before we joined).
      if (handshake.kind !== 'commit' || handshake.epoch < Number(epoch(conversation))) continue
      const before = conversation
      conversation = (await processIncoming(conversation, fromBase64(handshake.payload)))
        .conversation
      // Taken out by another member: nothing more to read or write with this state. A later
      // Welcome (someone lets the device in again) starts it over.
      if (!isOwn(conversation, keys)) {
        conversation = null
        continue
      }
      const had = new Set(peopleIn(before))
      const by = members(before).find((m) => m.identity.deviceId === handshake.senderDeviceId)
      const fresh = peopleIn(conversation).filter((id) => !had.has(id))
      if (fresh.length > 0) {
        await membership.arrived(channelId, by?.identity.userId ?? null, fresh)
      }
    }
    await persist(channelId, conversation, last)
    return {
      conversation,
      anyCommits: handshakes.some((h) => h.kind === 'commit') || cursor !== undefined,
    }
  }

  /** Posts a commit; false when another took the epoch (the state is rolled back then). */
  const commit = async (
    channelId: string,
    before: Uint8Array | null,
    made: MadeCommit,
    from: number,
    keys: DeviceKeys,
    targets: readonly { deviceId: string; keyPackageId: string }[] = [],
  ): Promise<boolean> => {
    try {
      await api.e2ee.postCommit(channelId, {
        deviceId: keys.identity.deviceId,
        epoch: from,
        commit: toBase64(made.commit),
        ...(made.welcome && targets.length > 0
          ? { welcome: toBase64(made.welcome), welcomeTargets: [...targets] }
          : {}),
      })
    } catch (error) {
      if (!isStale(error)) throw error
      await persist(channelId, before ? loadConversation(before, options) : null)
      return false
    }
    await persist(channelId, made.conversation)
    return true
  }

  return {
    serial,
    conversationOf,
    persist,
    sync,
    commit,

    /** Whether this device holds state for the conversation (it is in, or was). */
    hasState: async (channelId: string) => Boolean((await loadState(channelId)).state),

    /** The conversation leaves memory (deleted here); its stored state is the eraser's. */
    drop: (channelId: string) => {
      conversations.delete(channelId)
    },

    /** The device was registered anew: the old one's groups are of no use any more. */
    forgetAll: async () => {
      conversations.clear()
      await store.deletePrefix('conv:')
    },

    /** Signing out: nothing stays in memory. */
    clear: () => {
      conversations.clear()
      queues.clear()
    },
  }
}

export type ConversationStore = ReturnType<typeof createConversationStore>
