import { vi } from 'vitest'

import { decodePayload, encodePayload, fromBase64, toBase64 } from '../features/e2ee/codec'

import type {
  CallKey,
  CipherMessage,
  ConversationStatus,
  EncryptedChannel,
  ReadMessage,
  SendOptions,
} from '../features/e2ee/client'
import type { EncryptedFile } from '../features/e2ee/codec'
import type { ApprovalView } from '../features/e2ee/device-approval'
import type { E2eeClientFactory } from '../features/e2ee/e2ee-context'
import type { MemberNotice } from '../features/e2ee/group-membership'
import type { UseKeyResult } from '../features/e2ee/history-backup'
import type { IndexedMessage } from '../features/e2ee/local-search'
import type { SafetyStatus } from '../features/e2ee/safety'
import type { ApiClient } from '@chinchi/sdk'
import type { DeviceApproval, EncryptedReaction } from '@chinchi/shared'

/** What the fake shows as this device's recovery key. */
export const TEST_RECOVERY_KEY = 'ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-2345-6789-ABCD-EFGH-JKMN-PQRS-TVWX'

/** The signed-in user of `renderApp` (`testUser`). */
const testUserId = '100'

/** What the fake "encrypts" to: the payload in base64, so the fake can read it back. */
export const fakeCiphertext = (text: string, files?: EncryptedFile[]) =>
  toBase64(encodePayload(files ? { v: 1, text, files } : { v: 1, text }))

/** What the fake "encrypts" a set of reactions to. */
export const fakeReactionCiphertext = (emojis: string[]) =>
  toBase64(encodePayload({ v: 1, text: '', react: emojis }))

/** Stands in for the MLS client in UI tests (MLS itself is tested in features/e2ee). */
export const createFakeE2ee = (status: ConversationStatus = 'ready') => {
  let api: ApiClient | null = null
  let approvalViews: ApprovalView[] = []
  const approvalListeners = new Set<() => void>()
  const client = {
    approvals: {
      request: vi.fn(async () => '950'),
      handle: vi.fn(async (_approval: DeviceApproval) => undefined),
      compareHere: vi.fn(async (_approvalId: string) => undefined),
      confirm: vi.fn(async (_approvalId: string) => undefined),
      decline: vi.fn(async (_approvalId: string) => undefined),
      dismiss: vi.fn((approvalId: string) => {
        approvalViews = approvalViews.filter((view) => view.approvalId !== approvalId)
        for (const listener of approvalListeners) listener()
      }),
      views: () => approvalViews,
      subscribe: (listener: () => void) => {
        approvalListeners.add(listener)
        return () => {
          approvalListeners.delete(listener)
        }
      },
      /** Test helper: what the approval screens show now. */
      emit: (views: ApprovalView[]) => {
        approvalViews = views
        for (const listener of approvalListeners) listener()
      },
    },
    ready: vi.fn(async () => '700'),
    conversations: {
      remember: vi.fn(async (_channelId: string) => undefined),
      wasEncrypted: vi.fn(async (_channelId: string) => false),
    },
    invited: vi.fn(async (_channelId: string, _userIds: readonly string[]) => undefined),
    membership: vi.fn(
      async (
        _channel: EncryptedChannel,
      ): Promise<{ notices: MemberNotice[]; pending: string[] }> => ({
        notices: [],
        pending: [],
      }),
    ),
    dismissNotice: vi.fn(async (_channelId: string, _noticeId: string) => undefined),
    forgetConversation: vi.fn(
      async (_channelId: string, _options?: { keepKeys?: boolean }) => undefined,
    ),
    forget: vi.fn(async () => undefined),
    open: vi.fn(async (_channel: EncryptedChannel) => status),
    admit: vi.fn(async (_channel: EncryptedChannel) => undefined),
    send: vi.fn(
      async (
        channel: EncryptedChannel,
        text: string,
        { nonce, files = [], reply }: SendOptions = {},
      ) => {
        if (!api) throw new Error('The fake e2ee client has no API yet')
        const { message } = await api.messages.create(channel.id, {
          ciphertext: fakeCiphertext(text, files.length > 0 ? [...files] : undefined),
          ...(nonce ? { nonce } : {}),
          ...(files.length > 0 ? { attachmentIds: files.map((file) => file.id) } : {}),
          ...(reply ? { replyTo: reply.messageId, replyMention: reply.mention } : {}),
        })
        return message
      },
    ),
    edit: vi.fn(async (channel: EncryptedChannel, messageId: string, text: string) => {
      if (!api) throw new Error('The fake e2ee client has no API yet')
      const { message } = await api.messages.update(channel.id, messageId, {
        ciphertext: fakeCiphertext(text),
      })
      return message
    }),
    read: vi.fn(
      async (_channel: EncryptedChannel, message: CipherMessage): Promise<ReadMessage | null> => {
        const payload = message.ciphertext ? decodePayload(fromBase64(message.ciphertext)) : null
        return payload ? { payload, sender: { kind: 'verified' } } : null
      },
    ),
    devicesChanged: vi.fn(async (_userId: string) => undefined),
    search: vi.fn(
      async (_channel: EncryptedChannel, _query: string): Promise<IndexedMessage[]> => [],
    ),
    react: vi.fn(
      async (channel: EncryptedChannel, messageId: string, emojis: readonly string[]) => {
        if (!api) throw new Error('The fake e2ee client has no API yet')
        await api.reactions.setEncrypted(
          channel.id,
          messageId,
          emojis.length > 0 ? fakeReactionCiphertext([...emojis]) : null,
        )
      },
    ),
    readReaction: vi.fn(
      async (_channel: EncryptedChannel, _messageId: string, reaction: EncryptedReaction) =>
        decodePayload(fromBase64(reaction.ciphertext))?.react ?? [],
    ),
    recovery: {
      key: vi.fn(async (): Promise<string | null> => TEST_RECOVERY_KEY),
      // Saved by default, so the reminder stays out of tests about something else.
      saved: vi.fn(async () => true),
      markSaved: vi.fn(async () => undefined),
      useKey: vi.fn(async (_text: string): Promise<UseKeyResult> => 'ok'),
      reset: vi.fn(async () => undefined),
    },
    safety: {
      codeWith: vi.fn(
        async (_otherId: string) => '111112222233333444445555566666777778888899999000001234567890',
      ),
      status: vi.fn(async (memberIds: readonly string[]): Promise<SafetyStatus> => ({
        people: memberIds
          .filter((id) => id !== testUserId)
          .map((userId) => ({ userId, verified: false, newDevices: [], keyChanged: false })),
        mine: [],
      })),
      verify: vi.fn(async (_userId: string) => undefined),
      acknowledge: vi.fn(async (_userId: string) => undefined),
      acceptDevice: vi.fn(async (_userId: string, _deviceId: string) => undefined),
      acceptKey: vi.fn(async (_userId: string) => undefined),
      deviceCode: vi.fn(async (_key: string) => '48213901773526011849'),
      thisDeviceCode: vi.fn(async () => '70315284460391877512'),
      allowedDevices: vi.fn(async (_userId: string): Promise<ReadonlySet<string>> => new Set()),
    },
    callKey: vi.fn(async (_channel: EncryptedChannel): Promise<CallKey | null> =>
      status === 'ready' ? { epoch: 1, key: new Uint8Array(32).fill(1) } : null,
    ),
  }
  const factory: E2eeClientFactory = (_userId, givenApi) => {
    api = givenApi
    return client
  }
  return { client, factory }
}
