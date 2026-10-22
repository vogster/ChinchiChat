import type { EncryptedFile, EncryptedPayload } from './codec'
import type { E2eeStore } from './store'
import type { ApiClient } from '@chinchi/sdk'

/** The part of the API the client needs (the SDK client satisfies it). */
export interface E2eeApi {
  readonly e2ee: Pick<
    ApiClient['e2ee'],
    | 'myDevices'
    | 'devicesOf'
    | 'registerDevice'
    | 'deleteDevice'
    | 'uploadKeyPackages'
    | 'countKeyPackages'
    | 'claimKeyPackages'
    | 'postCommit'
    | 'handshakes'
    | 'userKey'
    | 'setUserKey'
    | 'signDevice'
    | 'backup'
    | 'createBackup'
    | 'putBackupEntries'
    | 'backupEntries'
    | 'approvals'
  >
  readonly reactions: Pick<ApiClient['reactions'], 'setEncrypted'>
  readonly messages: {
    create(
      channelId: string,
      body: {
        ciphertext: string
        nonce?: string
        attachmentIds?: string[]
        replyTo?: string
        replyMention?: boolean
      },
    ): Promise<{ message: { id: string; ciphertext: string | null } }>
    update(
      channelId: string,
      messageId: string,
      change: { ciphertext: string },
    ): Promise<{ message: { id: string; ciphertext: string | null; editedAt: string | null } }>
  }
}

/** An encrypted conversation as the client needs it: its channel and everyone in it. */
export interface EncryptedChannel {
  readonly id: string
  readonly memberIds: readonly string[]
  /** A group (people come and go); more than two members always are one. */
  readonly group?: boolean
}

/**
 * More than two people is a group whatever the server calls it: a "DM" it slips a third person
 * into must not take them in without anyone here adding them (see group-membership.ts).
 */
export const isGroup = (channel: EncryptedChannel) =>
  channel.group === true || channel.memberIds.length > 2

/** A message from the server: its id and MLS ciphertext (and the sender's nonce, for its author). */
export interface CipherMessage {
  readonly id: string
  readonly ciphertext: string | null
  readonly nonce?: string | null
  /** Set once edited: each edit is a new MLS message, decrypted (and kept) on its own. */
  readonly editedAt?: string | null
  /** Who wrote it (for the local search index). */
  readonly authorId?: string | null
}

/** ready: this device is in the conversation; waiting: another device has to let it in. */
export type ConversationStatus = 'ready' | 'waiting'

/**
 * Who really wrote a message, by the signature MLS checked, against the author the server
 * names. The server relays messages and could label one with someone else's name: a
 * `mismatch` is shown as the signer's, never the server's. `unverified` is a message from an
 * earlier epoch (sent just before a commit), where MLS gives no signer back.
 */
export type SenderCheck =
  | { readonly kind: 'verified' }
  | { readonly kind: 'unverified' }
  | { readonly kind: 'mismatch'; readonly userId: string }
  /** Came without encryption into an encrypted conversation: the server may have written it. */
  | { readonly kind: 'plain' }

/** A message as this device reads it: what was inside, and whether the author checks out. */
export interface ReadMessage {
  readonly payload: EncryptedPayload
  readonly sender: SenderCheck
}

export interface SendOptions {
  /** Echoed back by the gateway: the sender finds its own copy by it. */
  readonly nonce?: string | undefined
  /** Uploaded encrypted beforehand: their secrets ride inside, their attachments alongside. */
  readonly files?: readonly EncryptedFile[] | undefined
  /** The message this one answers (the server knows which, not what it says). */
  readonly reply?: { readonly messageId: string; readonly mention: boolean } | undefined
}

/** A call key and the epoch it belongs to (a later epoch replaces it). */
export interface CallKey {
  readonly epoch: number
  readonly key: Uint8Array
}

export interface E2eeClientOptions {
  readonly api: E2eeApi
  readonly store: E2eeStore
  readonly userId: string
  /** How the device shows in lists ("Firefox on Linux"). */
  readonly deviceName: string
}
