import {
  addMembers,
  createConversation,
  createKeyPackages,
  epoch,
  members,
  removeMembers,
  saveConversation,
} from '@chinchi/e2ee'

import { isGroup } from './client-types'
import { fromBase64 } from './codec'

import type { ConversationStatus, E2eeApi, EncryptedChannel } from './client-types'
import type { ConversationStore } from './conversation-store'
import type { createDeviceAdditions } from './device-additions'
import type { DeviceDirectory } from './device-directory'
import type { EncryptedMemory } from './encrypted-memory'
import type { GroupMembership } from './group-membership'
import type { Safety } from './safety'
import type { Conversation, DeviceKeys, KeyPackageBundle } from '@chinchi/e2ee'

export interface ConversationMembersDeps {
  readonly api: E2eeApi
  readonly userId: string
  readonly ready: () => Promise<DeviceKeys>
  readonly directory: DeviceDirectory
  readonly safety: Safety
  readonly conversations: ConversationStore
  readonly membership: GroupMembership
  readonly additions: ReturnType<typeof createDeviceAdditions>
  readonly encryptedMemory: EncryptedMemory
}

/**
 * Who is in each conversation's encryption: the members' devices this device trusts, added and
 * taken out by commits from here as members and their devices come and go.
 */
export const createConversationMembers = ({
  api,
  userId,
  ready,
  directory,
  safety,
  conversations,
  membership,
  additions,
  encryptedMemory,
}: ConversationMembersDeps) => {
  const { options } = directory

  /** The devices of these members a message should reach (device id → user id). */
  const devicesFor = async (
    memberIds: readonly string[],
    keys: DeviceKeys,
  ): Promise<Map<string, string>> => {
    const expected = new Map<string, string>()
    for (const memberId of memberIds) {
      const allowed = await safety.allowedDevices(memberId)
      for (const d of await directory.devicesOf(memberId)) {
        if (!d.revokedAt && allowed.has(d.id)) expected.set(d.id, d.userId)
      }
    }
    // This device is the one writing: it stays whatever its own standing.
    expected.set(keys.identity.deviceId, userId)
    return expected
  }

  /** Adds missing devices of the members and removes devices that are gone. */
  const reconcile = async (
    channel: EncryptedChannel,
    conversation: Conversation,
    keys: DeviceKeys,
  ) => {
    const expected = await devicesFor(channel.memberIds, keys)
    const present = members(conversation).map((m) => m.identity)
    // In a group, a device any member let in stays in for everyone (one consent is enough):
    // only devices gone from the members' lists leave. Two people alone: what this device
    // does not trust of the other person's goes, the other side being the only one who could
    // have let it in. My own devices still listed stay: one I would not add, the other let in.
    const keep =
      channel.memberIds.length > 2
        ? await directory.listedDevices(channel.memberIds)
        : new Set([...expected.keys(), ...(await directory.listedDevices([userId]))])
    // Never this device itself: a commit can't remove its own committer.
    const gone = present.filter(
      (m) => !keep.has(m.deviceId) && m.deviceId !== keys.identity.deviceId,
    )
    if (gone.length > 0) {
      const before = saveConversation(conversation)
      const made = await removeMembers(conversation, gone, options)
      const from = Number(epoch(conversation))
      if (!(await conversations.commit(channel.id, before, made, from, keys))) return false
      conversation = made.conversation
    }
    // A group takes in only people known here or added from here (see group-membership.ts).
    const welcome = isGroup(channel)
      ? await membership.settle(
          channel.id,
          channel.memberIds,
          present.map((m) => m.userId),
        )
      : null
    const missing = [...expected].filter(
      ([id, owner]) =>
        !present.some((m) => m.deviceId === id) &&
        additions.allowed(channel.id, id) &&
        (owner === userId || !welcome || welcome.has(owner)),
    )
    if (missing.length === 0) return true
    const claimed = (
      await Promise.all(
        [...new Set(missing.map(([, owner]) => owner))].map((owner) =>
          api.e2ee.claimKeyPackages(owner),
        ),
      )
    )
      .flatMap((r) => r.keyPackages)
      .filter((k) => missing.some(([id]) => id === k.deviceId))
    if (claimed.length === 0) return true
    const before = saveConversation(conversation)
    const made = await addMembers(
      conversation,
      claimed.map((k) => fromBase64(k.package)),
      options,
    )
    const added = await conversations.commit(
      channel.id,
      before,
      made,
      Number(epoch(conversation)),
      keys,
      claimed.map((k) => ({ deviceId: k.deviceId, keyPackageId: k.keyPackageId })),
    )
    if (added) {
      additions.record(
        channel.id,
        claimed.map((k) => ({ deviceId: k.deviceId, ownerId: expected.get(k.deviceId) ?? '' })),
      )
    }
    return added
  }

  /** Starts the conversation's group (the first commit claims epoch 0) or finds it taken. */
  const start = async (channel: EncryptedChannel, keys: DeviceKeys) => {
    const [own] = await createKeyPackages(keys, 1)
    const fresh = await createConversation(
      new TextEncoder().encode(channel.id),
      own as KeyPackageBundle,
      options,
    )
    // An empty commit even when alone: it tells everyone the group exists.
    const others = await devicesFor(channel.memberIds, keys)
    others.delete(keys.identity.deviceId)
    const claimed = (
      await Promise.all(
        [...new Set(others.values())].map((owner) => api.e2ee.claimKeyPackages(owner)),
      )
    )
      .flatMap((r) => r.keyPackages)
      .filter((k) => others.has(k.deviceId))
    const made =
      claimed.length > 0
        ? await addMembers(
            fresh,
            claimed.map((k) => fromBase64(k.package)),
            options,
          )
        : await removeMembers(fresh, [], options)
    const started = await conversations.commit(
      channel.id,
      null,
      made,
      0,
      keys,
      claimed.map((k) => ({ deviceId: k.deviceId, keyPackageId: k.keyPackageId })),
    )
    // Who starts takes the members as listed then (as with a first key).
    if (started) await membership.begin(channel.id, channel.memberIds)
    return started
  }

  return {
    /**
     * The conversation caught up and matching the members right now: someone who just left must
     * not get the next message, whether or not anyone has reopened the conversation since.
     */
    inStep: async (channel: EncryptedChannel, keys: DeviceKeys): Promise<Conversation> => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const { conversation } = await conversations.sync(channel.id, keys)
        if (!conversation) break
        if (await reconcile(channel, conversation, keys)) {
          const current = await conversations.conversationOf(channel.id, keys)
          if (current) return current
        }
      }
      throw new Error('This device is not in the conversation yet')
    },

    /** Joins or starts the conversation's group here, taking in the members' new devices. */
    open: (channel: EncryptedChannel): Promise<ConversationStatus> =>
      conversations.serial(channel.id, async () => {
        await encryptedMemory.remember(channel.id)
        const keys = await ready()
        // Fresh device lists: opening is when a member's new or removed devices get noticed.
        for (const memberId of channel.memberIds) directory.forgetUser(memberId)
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const { conversation, anyCommits } = await conversations.sync(channel.id, keys)
          if (!conversation) {
            if (anyCommits) return 'waiting'
            if (await start(channel, keys)) return 'ready'
            continue
          }
          if (await reconcile(channel, conversation, keys)) return 'ready'
        }
        return (await conversations.conversationOf(channel.id, keys)) ? 'ready' : 'waiting'
      }),

    /**
     * Lets the members' new devices into a conversation this device is in, without it being
     * open here (in the background, after a device is approved). Starts nothing elsewhere.
     */
    admit: (channel: EncryptedChannel): Promise<void> =>
      conversations.serial(channel.id, async () => {
        if (!(await conversations.hasState(channel.id))) return
        const keys = await ready()
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const { conversation } = await conversations.sync(channel.id, keys)
          if (!conversation || (await reconcile(channel, conversation, keys))) return
        }
      }),
  }
}

export type ConversationMembers = ReturnType<typeof createConversationMembers>
