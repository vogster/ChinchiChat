import {
  acceptAll,
  createApplicationMessage,
  createCommit,
  createGroup,
  decodeGroupState,
  decodeMlsMessage,
  emptyPskIndex,
  encodeGroupState,
  encodeMlsMessage,
  joinGroup,
  mlsExporter,
  processMessage,
  zeroOutUint8Array,
} from 'ts-mls'
// Pinned version: ts-mls hands back an application message without its sender, so the sender
// is read here, through the same function processMessage uses (see openApplication).
import { defaultClientConfig } from 'ts-mls/clientConfig.js'
import { unprotectPrivateMessage } from 'ts-mls/messageProtection.js'
import { getSenderLeafNodeIndex } from 'ts-mls/sender.js'

import { decodeIdentity, decodeKeyPackage, unpackPrivate } from './device'
import { cipherSuite } from './suite'

import type { DeviceIdentity, DeviceKeys, KeyPackageBundle } from './device'
import type { CryptoBackend } from './suite'
import type { ClientConfig, ClientState, MLSMessage, PrivateMessage } from 'ts-mls'

/**
 * Decides whether a device may be in a conversation, given the identity in its credential and
 * its signature key (the app checks both against the server's device list).
 */
export type TrustDevice = (
  identity: DeviceIdentity,
  signaturePublicKey: Uint8Array,
) => Promise<boolean>

export interface ConversationOptions {
  readonly trust: TrustDevice
  readonly backend?: CryptoBackend
}

/** One device's view of an encrypted conversation (an MLS group). Immutable: every step returns a new one. */
export interface Conversation {
  readonly state: ClientState
}

export interface Member {
  readonly identity: DeviceIdentity
  readonly signaturePublicKey: Uint8Array
}

export type Incoming =
  | {
      readonly kind: 'message'
      readonly sender: DeviceIdentity | null
      readonly plaintext: Uint8Array
    }
  | { readonly kind: 'commit' }

const configFor = (trust: TrustDevice): ClientConfig => ({
  ...defaultClientConfig,
  authService: {
    validateCredential: async (credential, signaturePublicKey) => {
      if (credential.credentialType !== 'basic') return false
      const identity = decodeIdentity(credential.identity)
      return identity !== null && trust(identity, signaturePublicKey)
    },
  },
})

const wipe = (keys: Uint8Array[]) => keys.forEach(zeroOutUint8Array)

const decodeMessage = (bytes: Uint8Array): MLSMessage => {
  const message = decodeMlsMessage(bytes, 0)?.[0]
  if (!message) throw new Error('Not an MLS message')
  return message
}

const leafAt = (state: ClientState, leafIndex: number) => {
  const node = state.ratchetTree[leafIndex * 2]
  return node?.nodeType === 'leaf' ? node.leaf : undefined
}

export const members = ({ state }: Conversation): Member[] =>
  state.ratchetTree.flatMap((node) => {
    if (node?.nodeType !== 'leaf' || node.leaf.credential.credentialType !== 'basic') return []
    const identity = decodeIdentity(node.leaf.credential.identity)
    return identity ? [{ identity, signaturePublicKey: node.leaf.signaturePublicKey }] : []
  })

/** The device this state belongs to (its own leaf); null if the leaf can't be read. */
export const ownIdentity = ({ state }: Conversation): DeviceIdentity | null => {
  const leaf = leafAt(state, state.privatePath.leafIndex)
  return leaf?.credential.credentialType === 'basic'
    ? decodeIdentity(leaf.credential.identity)
    : null
}

export const epoch = ({ state }: Conversation): bigint => state.groupContext.epoch

/** Starts a conversation with only this device in it; others are added with addMembers. */
export const createConversation = async (
  groupId: Uint8Array,
  own: KeyPackageBundle,
  options: ConversationOptions,
): Promise<Conversation> => {
  const impl = await cipherSuite(options.backend)
  const state = await createGroup(
    groupId,
    decodeKeyPackage(own.publicPackage),
    unpackPrivate(own.privatePackage),
    [],
    impl,
    configFor(options.trust),
  )
  return { state }
}

/**
 * Adds devices from their key packages: a commit for the members, a Welcome for the new ones.
 * Like every commit it uses up secrets of the given state; to retry if the server refuses the
 * commit (another one won the epoch), roll back to a copy saved before (saveConversation).
 */
export const addMembers = async (
  conversation: Conversation,
  keyPackages: readonly Uint8Array[],
  options: ConversationOptions,
): Promise<{ conversation: Conversation; commit: Uint8Array; welcome: Uint8Array }> => {
  const impl = await cipherSuite(options.backend)
  const result = await createCommit(
    { state: conversation.state, cipherSuite: impl },
    {
      extraProposals: keyPackages.map((bytes) => ({
        proposalType: 'add' as const,
        add: { keyPackage: decodeKeyPackage(bytes) },
      })),
      // The Welcome carries the tree, so joiners need nothing else from the server.
      ratchetTreeExtension: true,
    },
  )
  wipe(result.consumed)
  if (!result.welcome) throw new Error('Adding members made no Welcome')
  return {
    conversation: { state: result.newState },
    commit: encodeMlsMessage(result.commit),
    welcome: encodeMlsMessage({
      welcome: result.welcome,
      wireformat: 'mls_welcome',
      version: 'mls10',
    }),
  }
}

/** Removes every leaf of the given devices (a commit: see addMembers about rolling back). */
export const removeMembers = async (
  conversation: Conversation,
  devices: readonly DeviceIdentity[],
  options: ConversationOptions,
): Promise<{ conversation: Conversation; commit: Uint8Array }> => {
  const impl = await cipherSuite(options.backend)
  const leaves = conversation.state.ratchetTree.flatMap((node, nodeIndex) => {
    if (node?.nodeType !== 'leaf' || node.leaf.credential.credentialType !== 'basic') return []
    const identity = decodeIdentity(node.leaf.credential.identity)
    const removed = devices.some(
      (d) => d.userId === identity?.userId && d.deviceId === identity.deviceId,
    )
    return removed ? [nodeIndex / 2] : []
  })
  const result = await createCommit(
    { state: conversation.state, cipherSuite: impl },
    {
      extraProposals: leaves.map((removed) => ({
        proposalType: 'remove' as const,
        remove: { removed },
      })),
    },
  )
  wipe(result.consumed)
  return { conversation: { state: result.newState }, commit: encodeMlsMessage(result.commit) }
}

/** Joins from a Welcome addressed to one of this device's key packages. */
export const joinConversation = async (
  welcome: Uint8Array,
  bundle: KeyPackageBundle,
  options: ConversationOptions,
): Promise<Conversation> => {
  const impl = await cipherSuite(options.backend)
  const message = decodeMessage(welcome)
  if (message.wireformat !== 'mls_welcome') throw new Error('Not a Welcome')
  const state = await joinGroup(
    message.welcome,
    decodeKeyPackage(bundle.publicPackage),
    unpackPrivate(bundle.privatePackage),
    emptyPskIndex,
    impl,
    undefined,
    undefined,
    configFor(options.trust),
  )
  return { state }
}

export const encryptMessage = async (
  conversation: Conversation,
  plaintext: Uint8Array,
  options: Pick<ConversationOptions, 'backend'> = {},
): Promise<{ conversation: Conversation; ciphertext: Uint8Array }> => {
  const impl = await cipherSuite(options.backend)
  const result = await createApplicationMessage(conversation.state, plaintext, impl)
  wipe(result.consumed)
  return {
    conversation: { state: result.newState },
    ciphertext: encodeMlsMessage({
      privateMessage: result.privateMessage,
      wireformat: 'mls_private_message',
      version: 'mls10',
    }),
  }
}

/** A current-epoch application message, opened here so its (signed) sender is known. */
const openApplication = async (
  state: ClientState,
  message: PrivateMessage,
  backend?: CryptoBackend,
) => {
  const impl = await cipherSuite(backend)
  const result = await unprotectPrivateMessage(
    state.keySchedule.senderDataSecret,
    message,
    state.secretTree,
    state.ratchetTree,
    state.groupContext,
    state.clientConfig.keyRetentionConfig,
    impl,
  )
  wipe(result.consumed)
  const { content } = result.content
  if (content.contentType !== 'application') throw new Error('Expected an application message')
  const leafIndex = getSenderLeafNodeIndex(content.sender)
  const leaf = leafIndex === undefined ? undefined : leafAt(state, leafIndex)
  const sender =
    leaf?.credential.credentialType === 'basic' ? decodeIdentity(leaf.credential.identity) : null
  return {
    conversation: { state: { ...state, secretTree: result.tree } },
    incoming: { kind: 'message' as const, sender, plaintext: content.applicationData },
  }
}

/**
 * Applies a message from the server: a commit moves the conversation to its next epoch, an
 * application message is decrypted. The sender is null only for a message from an earlier
 * epoch (sent just before a commit); the app then relies on the server's author.
 */
export const processIncoming = async (
  conversation: Conversation,
  bytes: Uint8Array,
  options: Pick<ConversationOptions, 'backend'> = {},
): Promise<{ conversation: Conversation; incoming: Incoming }> => {
  const message = decodeMessage(bytes)
  if (message.wireformat !== 'mls_private_message' && message.wireformat !== 'mls_public_message') {
    throw new Error('Not a group message')
  }
  if (
    message.wireformat === 'mls_private_message' &&
    message.privateMessage.contentType === 'application' &&
    message.privateMessage.epoch === conversation.state.groupContext.epoch
  ) {
    return openApplication(conversation.state, message.privateMessage, options.backend)
  }
  const impl = await cipherSuite(options.backend)
  const result = await processMessage(message, conversation.state, emptyPskIndex, acceptAll, impl)
  wipe(result.consumed)
  const next = { state: result.newState }
  return result.kind === 'applicationMessage'
    ? { conversation: next, incoming: { kind: 'message', sender: null, plaintext: result.message } }
    : { conversation: next, incoming: { kind: 'commit' } }
}

/**
 * A secret every member derives alike for this epoch (e.g. the key of a call); it changes with
 * every commit, so a removed device can't follow.
 */
export const exportSecret = async (
  conversation: Conversation,
  label: string,
  length = 32,
  options: Pick<ConversationOptions, 'backend'> = {},
): Promise<Uint8Array> =>
  mlsExporter(
    conversation.state.keySchedule.exporterSecret,
    label,
    conversation.state.groupContext.groupId,
    length,
    await cipherSuite(options.backend),
  )

export const saveConversation = ({ state }: Conversation): Uint8Array => encodeGroupState(state)

/** The saved state leaves out the client config: it comes back from the options. */
export const loadConversation = (bytes: Uint8Array, options: ConversationOptions): Conversation => {
  const decoded = decodeGroupState(bytes, 0)?.[0]
  if (!decoded) throw new Error('Not a saved conversation')
  return { state: { ...decoded, clientConfig: configFor(options.trust) } }
}

export type { DeviceKeys }
