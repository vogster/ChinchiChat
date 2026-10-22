import { encryptMessage, epoch, exportSecret, processIncoming } from '@chinchi/e2ee'

import { decodePayload, encodePayload, fromBase64, toBase64 } from './codec'

import type { BackupKeeper } from './backup-keeper'
import type {
  CallKey,
  CipherMessage,
  E2eeApi,
  EncryptedChannel,
  ReadMessage,
  SenderCheck,
  SendOptions,
} from './client-types'
import type { EncryptedPayload } from './codec'
import type { ConversationMembers } from './conversation-members'
import type { ConversationStore } from './conversation-store'
import type { HistoryBackup } from './history-backup'
import type { createLocalSearch } from './local-search'
import type { E2eeStore } from './store'
import type { Conversation, DeviceIdentity, DeviceKeys } from '@chinchi/e2ee'

/** Exporter label of call keys; every member derives the same key for an epoch. */
const CALL_KEY_LABEL = 'chinchi call'

const VERIFIED: SenderCheck = { kind: 'verified' }

/** Plaintext as stored before sender checks existed (the payload alone) still reads. */
const storedMessage = (value: ReadMessage | EncryptedPayload): ReadMessage =>
  'v' in value ? { payload: value, sender: VERIFIED } : value

const checkSender = (
  sender: { readonly userId: string } | null,
  authorId: string | null | undefined,
): SenderCheck => {
  if (!sender || !authorId) return { kind: 'unverified' }
  return sender.userId === authorId ? VERIFIED : { kind: 'mismatch', userId: sender.userId }
}

/** Where a message's plaintext is kept: per edit, since each edit is a new MLS message. */
const plainKey = ({ id, editedAt }: Pick<CipherMessage, 'id' | 'editedAt'>) =>
  editedAt ? `plain:${id}:${editedAt}` : `plain:${id}`

export interface EncryptedMessagesDeps {
  readonly api: E2eeApi
  readonly store: E2eeStore
  readonly userId: string
  readonly ready: () => Promise<DeviceKeys>
  readonly conversations: ConversationStore
  readonly members: ConversationMembers
  readonly backup: HistoryBackup
  readonly keeper: BackupKeeper
  readonly index: ReturnType<typeof createLocalSearch>
}

/** Messages of encrypted conversations: sent, edited and read here, and remembered once read. */
export const createEncryptedMessages = ({
  api,
  store,
  userId,
  ready,
  conversations,
  members,
  backup,
  keeper,
  index,
}: EncryptedMessagesDeps) => {
  const { serial, persist } = conversations

  /**
   * Decrypts an MLS message of the conversation, with the device that signed it (null for a
   * message of an earlier epoch); null if this device can't read it (call within `serial`).
   */
  const decrypt = async (
    channelId: string,
    ciphertext: string,
  ): Promise<{ payload: EncryptedPayload; sender: DeviceIdentity | null } | null> => {
    const keys = await ready()
    if (!(await conversations.conversationOf(channelId, keys))) {
      await conversations.sync(channelId, keys)
    }
    const attempt = async () => {
      const conversation = await conversations.conversationOf(channelId, keys)
      if (!conversation) return null
      const result = await processIncoming(conversation, fromBase64(ciphertext))
      await persist(channelId, result.conversation)
      if (result.incoming.kind !== 'message') return null
      const payload = decodePayload(result.incoming.plaintext)
      return payload ? { payload, sender: result.incoming.sender } : null
    }
    try {
      return await attempt()
    } catch {
      // Maybe sent after a commit this device hasn't applied: catch up and try again.
      await conversations.sync(channelId, keys)
      return attempt().catch(() => null)
    }
  }

  /** Encrypts a payload for the conversation as it is now (call within `serial`). */
  const encrypt = async (
    channelId: string,
    conversation: Conversation,
    payload: EncryptedPayload,
  ): Promise<string> => {
    const result = await encryptMessage(conversation, encodePayload(payload))
    await persist(channelId, result.conversation)
    return toBase64(result.ciphertext)
  }

  return {
    decrypt,
    encrypt,

    /**
     * Encrypts and sends; the plaintext is kept, since the sender can't decrypt its own. Files
     * are uploaded encrypted beforehand: their secrets ride inside, their attachments alongside.
     */
    send: (
      channel: EncryptedChannel,
      text: string,
      { nonce, files = [], reply }: SendOptions = {},
    ): Promise<CipherMessage> =>
      serial(channel.id, async () => {
        const conversation = await members.inStep(channel, await ready())
        const payload: EncryptedPayload =
          files.length > 0 ? { v: 1, text, files: [...files] } : { v: 1, text }
        const ciphertext = await encrypt(channel.id, conversation, payload)
        const own: ReadMessage = { payload, sender: VERIFIED }
        // The gateway may echo the message before the request returns: find it by nonce then.
        if (nonce) await store.set(`plain:nonce:${nonce}`, own)
        const { message } = await api.messages.create(channel.id, {
          ciphertext,
          ...(nonce ? { nonce } : {}),
          ...(files.length > 0 ? { attachmentIds: files.map((file) => file.id) } : {}),
          ...(reply ? { replyTo: reply.messageId, replyMention: reply.mention } : {}),
        })
        await store.set(`plain:${message.id}`, own)
        await keeper.keep(message.id, payload)
        await index.record(channel.id, { id: message.id, authorId: userId, text })
        return message
      }),

    /**
     * A message decrypted once and then remembered, with its author checked against the
     * signature MLS verified; null when this device can't read it.
     */
    read: (channel: EncryptedChannel, message: CipherMessage): Promise<ReadMessage | null> =>
      serial(channel.id, async () => {
        const known =
          (await store.get<ReadMessage | EncryptedPayload>(plainKey(message))) ??
          (message.nonce && !message.editedAt
            ? await store.get<ReadMessage | EncryptedPayload>(`plain:nonce:${message.nonce}`)
            : undefined)
        if (known) return storedMessage(known)
        if (!message.ciphertext) return null
        const opened = await decrypt(channel.id, message.ciphertext)
        if (opened) await keeper.keep(message.id, opened.payload)
        // Sent before this device joined (or lost with it): the history backup may have it. It
        // was written by this user's own device after reading, so it counts as verified.
        const read: ReadMessage | null = opened
          ? { payload: opened.payload, sender: checkSender(opened.sender, message.authorId) }
          : await backup
              .restore(channel.id, message.id)
              .then((payload) => (payload ? { payload, sender: VERIFIED } : null))
              .catch(() => null)
        if (read) {
          await store.set(plainKey(message), read)
          await index.record(channel.id, {
            id: message.id,
            // A relabelled message is indexed under who really signed it.
            authorId:
              read.sender.kind === 'mismatch' ? read.sender.userId : (message.authorId ?? null),
            text: read.payload.text,
          })
        }
        return read
      }),

    /** Replaces the text of my message; its files stay as they were. */
    edit: (channel: EncryptedChannel, messageId: string, text: string): Promise<CipherMessage> =>
      serial(channel.id, async () => {
        const conversation = await members.inStep(channel, await ready())
        // Unknown here, its files would be lost: edit it where it can be read.
        const stored = await store.get<ReadMessage | EncryptedPayload>(`plain:${messageId}`)
        if (!stored) throw new Error('This message is not readable on this device')
        const before = storedMessage(stored).payload
        const payload: EncryptedPayload = before.files
          ? { v: 1, text, files: before.files }
          : { v: 1, text }
        const ciphertext = await encrypt(channel.id, conversation, payload)
        const { message } = await api.messages.update(channel.id, messageId, { ciphertext })
        await store.set(plainKey(message), { payload, sender: VERIFIED } satisfies ReadMessage)
        await keeper.keep(messageId, payload)
        await index.record(channel.id, { id: messageId, authorId: userId, text })
        return message
      }),

    /** The key of a call in this conversation for its current epoch; null while waiting. */
    callKey: (channel: EncryptedChannel): Promise<CallKey | null> =>
      serial(channel.id, async () => {
        const { conversation } = await conversations.sync(channel.id, await ready())
        if (!conversation) return null
        return {
          epoch: Number(epoch(conversation)),
          key: await exportSecret(conversation, CALL_KEY_LABEL),
        }
      }),
  }
}
