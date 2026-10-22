import { createBackupKeeper } from './backup-keeper'
import { isGroup } from './client-types'
import { createConversationEraser } from './conversation-eraser'
import { createConversationMembers } from './conversation-members'
import { createConversationStore, peopleIn } from './conversation-store'
import { createCrossSigning } from './cross-signing'
import { createDeviceAdditions } from './device-additions'
import { createDeviceApproval } from './device-approval'
import { createDeviceDirectory } from './device-directory'
import { createEncryptedMemory } from './encrypted-memory'
import { createEncryptedMessages } from './encrypted-messages'
import { createEncryptedReactions } from './encrypted-reactions'
import { createGroupMembership } from './group-membership'
import { createHistoryBackup } from './history-backup'
import { createKeyPackageStore } from './key-packages'
import { createLocalSearch } from './local-search'
import { createSafety } from './safety'
import { createThisDevice } from './this-device'

import type { E2eeClientOptions, EncryptedChannel } from './client-types'
import type { IdentityProof } from './cross-signing'

export type {
  CallKey,
  CipherMessage,
  ConversationStatus,
  E2eeApi,
  E2eeClientOptions,
  EncryptedChannel,
  ReadMessage,
  SenderCheck,
  SendOptions,
} from './client-types'

/**
 * The end-to-end encryption client of one signed-in user on this browser: put together here
 * from its parts (this device, its key packages, the conversations' MLS state and members,
 * messages, reactions, the history backup, safety checks and approvals).
 */
export const createE2eeClient = ({ api, store, userId, deviceName }: E2eeClientOptions) => {
  const directory = createDeviceDirectory({ api, userId })
  const keyPackages = createKeyPackageStore({ api, store })
  const membership = createGroupMembership(store)
  const encryptedMemory = createEncryptedMemory(store)
  const additions = createDeviceAdditions()
  const conversations = createConversationStore({
    api,
    store,
    userId,
    options: directory.options,
    keyPackages,
    membership,
  })
  const crossSigning = createCrossSigning({ api, store, userId })
  const backup = createHistoryBackup({ api, store, crossSigning })
  const device = createThisDevice({
    api,
    store,
    userId,
    deviceName,
    directory,
    keyPackages,
    conversations,
    crossSigning,
    backup,
  })
  const { ready } = device

  /**
   * Safety codes, new-device warnings and who may be encrypted for: devices signed by the user
   * key known here, and those the person here let in. Nothing else, whatever the server lists.
   */
  const safety = createSafety({
    store,
    userId,
    devicesOf: directory.devicesOf,
    userKeyOf: directory.userKeyOf,
    thisDevice: async () => (await ready()).identity.deviceId,
    thisDeviceKey: device.publicKey,
    heldUserKey: async () => (await crossSigning.held())?.publicKey ?? null,
  })

  const members = createConversationMembers({
    api,
    userId,
    ready,
    directory,
    safety,
    conversations,
    membership,
    additions,
    encryptedMemory,
  })
  const keeper = createBackupKeeper({ store, backup })
  const index = createLocalSearch(store)
  const messages = createEncryptedMessages({
    api,
    store,
    userId,
    ready,
    conversations,
    members,
    backup,
    keeper,
    index,
  })

  return {
    /** Conversations this device saw encrypted (a server can't quietly turn that off). */
    conversations: encryptedMemory,

    /** People added to a group from this device: it takes them in (see group-membership.ts). */
    invited: (channelId: string, userIds: readonly string[]) =>
      membership.invite(channelId, userIds),

    /**
     * A group as this device sees it: who came in by a member's commit (to compare codes with),
     * and who the server lists but is not in the encryption yet (messages don't reach them).
     */
    membership: async (channel: EncryptedChannel) => {
      const conversation = await conversations.conversationOf(channel.id, await ready())
      const inIt = new Set(conversation ? peopleIn(conversation) : [])
      return {
        notices: await membership.notices(channel.id),
        pending:
          conversation && isGroup(channel)
            ? channel.memberIds.filter((id) => id !== userId && !inIt.has(id))
            : [],
      }
    },

    dismissNotice: (channelId: string, noticeId: string) => membership.dismiss(channelId, noticeId),

    /**
     * Deleted for everyone: nothing of the conversation stays on this device. `keepKeys` for a
     * conversation only hidden here: its text goes, its group keys stay (see the eraser).
     */
    forgetConversation: (channelId: string, options?: { keepKeys?: boolean }) =>
      conversations.serial(channelId, async () => {
        if (!options?.keepKeys) conversations.drop(channelId)
        await createConversationEraser(store).forget(channelId, options)
      }),

    /** Registers this device on first use and keeps its key packages topped up. */
    ready: async () => (await ready()).identity.deviceId,

    /**
     * Signing out: this device leaves every conversation (the server revokes it, members drop
     * it on their next send) and nothing of it stays in the browser: no keys, no plaintext, no
     * recovery key. The next sign-in here is a new device.
     */
    forget: async (): Promise<void> => {
      await device.revoke()
      await store.clear()
      device.reset()
      conversations.clear()
      directory.clear()
      additions.clear()
    },

    open: members.open,
    admit: members.admit,
    send: messages.send,
    read: messages.read,
    edit: messages.edit,
    callKey: messages.callKey,

    /** The recovery key: shown to save, typed on a new device to get history and trust back. */
    recovery: {
      key: backup.key,
      saved: backup.saved,
      markSaved: backup.markSaved,
      useKey: async (text: string) => {
        const result = await backup.useKey(text, await ready())
        if (result === 'ok') directory.forgetUser(userId)
        return result
      },
      /**
       * Lost everything, key included: new keys (with the password); people who checked this
       * user see it.
       */
      reset: async (identity: IdentityProof) => {
        const userKey = await crossSigning.reset(await ready(), identity)
        await backup.reset(userKey)
        directory.forgetUser(userId)
      },
    },

    ...createEncryptedReactions({
      api,
      store,
      userId,
      serial: conversations.serial,
      ready,
      inStep: members.inStep,
      encrypt: messages.encrypt,
      decrypt: messages.decrypt,
      keepReaction: keeper.keepReaction,
      restoreReaction: keeper.restoreReaction,
    }),

    /** Search in a conversation, over what this device decrypted (the server can't). */
    search: (channel: EncryptedChannel, query: string) => index.search(channel.id, query),

    /** Approving this device from another of the user's, or another device from this one. */
    approvals: createDeviceApproval({ api, ready, crossSigning, backup }),

    /** Sends the history backup what is waiting (tests; the client does it on its own). */
    flushBackup: () => backup.flush(),

    /** Safety codes, new-device warnings, device codes and letting devices in. */
    safety,

    /**
     * A member's devices changed: forget the cached list (the next open reconciles), and add
     * their devices again even where someone took them out before.
     */
    devicesChanged: async (changedUserId: string) => {
      directory.forgetUser(changedUserId)
      additions.forgetOwner(changedUserId)
    },
  }
}

export type E2eeClient = ReturnType<typeof createE2eeClient>
