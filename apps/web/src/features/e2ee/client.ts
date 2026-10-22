import {
  addMembers,
  createConversation,
  createDeviceKeys,
  createKeyPackages,
  encryptMessage,
  epoch,
  exportSecret,
  joinConversation,
  loadConversation,
  members,
  processIncoming,
  removeMembers,
  saveConversation,
} from '@chinchi/e2ee'
import { ApiError } from '@chinchi/sdk'

import { decodePayload, encodePayload, fromBase64, toBase64 } from './codec'
import { createConversationEraser } from './conversation-eraser'
import { createCrossSigning } from './cross-signing'
import { createDeviceAdditions } from './device-additions'
import { createDeviceApproval } from './device-approval'
import { createEncryptedMemory } from './encrypted-memory'
import { createEncryptedReactions } from './encrypted-reactions'
import { createGroupMembership } from './group-membership'
import { createHistoryBackup } from './history-backup'
import { createLocalSearch } from './local-search'
import { createSafety } from './safety'

import type { EncryptedFile, EncryptedPayload } from './codec'
import type { IdentityProof } from './cross-signing'
import type { E2eeStore } from './store'
import type {
  Conversation,
  ConversationOptions,
  DeviceIdentity,
  DeviceKeys,
  KeyPackageBundle,
} from '@chinchi/e2ee'
import type { ApiClient } from '@chinchi/sdk'
import type { Device, Handshake } from '@chinchi/shared'

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
  /** A group (people come and go); by default, more than two members. */
  readonly group?: boolean
}

const isGroup = (channel: EncryptedChannel) => channel.group ?? channel.memberIds.length > 2

/** The people (user ids) with a device in the conversation. */
const peopleIn = (conversation: Conversation) => [
  ...new Set(members(conversation).map((m) => m.identity.userId)),
]

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

/** A message as this device reads it: what was inside, and whether the author checks out. */
export interface ReadMessage {
  readonly payload: EncryptedPayload
  readonly sender: SenderCheck
}

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

interface StoredDevice {
  /** Absent until the server answers: the keys are saved first, so a reload retries with them. */
  readonly id?: string
  readonly signaturePublicKey: string
  readonly signaturePrivateKey: string
}

interface StoredConversation {
  /** Saved MLS state; absent while waiting for a Welcome. */
  readonly state?: string
  /** The last handshake already applied (or skipped). */
  readonly cursor?: string
}

interface StoredBundle {
  readonly publicPackage: string
  readonly privatePackage: string
}

const KEY_PACKAGE_BATCH = 20
const KEY_PACKAGE_LOW = 10
/** Exporter label of call keys; every member derives the same key for an epoch. */
const CALL_KEY_LABEL = 'chinchi call'

const isStale = (error: unknown) => error instanceof ApiError && error.code === 'STALE_EPOCH'

const localLocks = new Map<string, Promise<unknown>>()

/**
 * Runs `task` alone across this browser's tabs and clients (Web Locks), or at least across
 * this page where the API is missing: two clients must not each register a device.
 */
const exclusively = <T>(name: string, task: () => Promise<T>): Promise<T> => {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(name, task)
  }
  const run = (localLocks.get(name) ?? Promise.resolve()).then(task, task)
  localLocks.set(
    name,
    run.catch(() => undefined),
  )
  return run
}

/** Where a message's plaintext is kept: per edit, since each edit is a new MLS message. */
const plainKey = ({ id, editedAt }: Pick<CipherMessage, 'id' | 'editedAt'>) =>
  editedAt ? `plain:${id}:${editedAt}` : `plain:${id}`

export const createE2eeClient = ({ api, store, userId, deviceName }: E2eeClientOptions) => {
  let device: Promise<DeviceKeys> | null = null
  const devicesByUser = new Map<string, Promise<Device[]>>()
  const conversations = new Map<string, Conversation>()
  const queues = new Map<string, Promise<unknown>>()
  const additions = createDeviceAdditions()

  /** One operation at a time per conversation: MLS state moves in a line. */
  const serial = <T>(channelId: string, task: () => Promise<T>): Promise<T> => {
    const run = (queues.get(channelId) ?? Promise.resolve()).then(task, task)
    queues.set(
      channelId,
      run.catch(() => undefined),
    )
    return run
  }

  const devicesOf = (id: string) => {
    let found = devicesByUser.get(id)
    if (!found) {
      found = (id === userId ? api.e2ee.myDevices() : api.e2ee.devicesOf(id)).then((r) => r.devices)
      devicesByUser.set(id, found)
      found.catch(() => devicesByUser.delete(id))
    }
    return found
  }

  /** A device may be in a conversation if the server lists it for its user with that key. */
  const options: ConversationOptions = {
    trust: async (identity, signaturePublicKey) => {
      const key = toBase64(signaturePublicKey)
      const listed = async () =>
        (await devicesOf(identity.userId)).some(
          (d) => d.id === identity.deviceId && d.signaturePublicKey === key,
        )
      if (await listed()) return true
      // A device added a moment ago: look again once.
      devicesByUser.delete(identity.userId)
      return listed()
    },
  }

  const saveBundles = async (bundles: readonly KeyPackageBundle[]) => {
    const kept = (await store.get<StoredBundle[]>('bundles')) ?? []
    await store.set('bundles', [
      ...kept,
      ...bundles.map((b) => ({
        publicPackage: toBase64(b.publicPackage),
        privatePackage: toBase64(b.privatePackage),
      })),
    ])
  }

  const topUpKeyPackages = async (keys: DeviceKeys, lastResort: boolean) => {
    const bundles = await createKeyPackages(keys, KEY_PACKAGE_BATCH + (lastResort ? 1 : 0))
    await saveBundles(bundles)
    const encoded = bundles.map((b) => toBase64(b.publicPackage))
    await api.e2ee.uploadKeyPackages(keys.identity.deviceId, {
      packages: lastResort ? encoded.slice(1) : encoded,
      ...(lastResort ? { lastResort: encoded[0] as string } : {}),
    })
  }

  const registerDevice = async (): Promise<DeviceKeys> => {
    const saved = await store.get<StoredDevice>('device')
    const savedId = saved?.id
    const listed = savedId
      ? (await devicesOf(userId)).some((d) => d.id === savedId && !d.revokedAt)
      : false
    if (saved && savedId && listed) {
      const keys: DeviceKeys = {
        identity: { userId, deviceId: savedId },
        signaturePublicKey: fromBase64(saved.signaturePublicKey),
        signaturePrivateKey: fromBase64(saved.signaturePrivateKey),
      }
      const { count } = await api.e2ee.countKeyPackages(savedId)
      if (count < KEY_PACKAGE_LOW) await topUpKeyPackages(keys, false)
      return keys
    }
    // An unfinished registration is retried with its keys (the server hands back the same
    // device); otherwise this browser is new here, or its device was removed elsewhere.
    const fresh: DeviceKeys =
      saved && !savedId
        ? {
            identity: { userId, deviceId: '0' },
            signaturePublicKey: fromBase64(saved.signaturePublicKey),
            signaturePrivateKey: fromBase64(saved.signaturePrivateKey),
          }
        : await createDeviceKeys({ userId, deviceId: '0' })
    await store.set('device', {
      signaturePublicKey: toBase64(fresh.signaturePublicKey),
      signaturePrivateKey: toBase64(fresh.signaturePrivateKey),
    } satisfies StoredDevice)
    const { device: registered } = await api.e2ee.registerDevice({
      name: deviceName,
      signaturePublicKey: toBase64(fresh.signaturePublicKey),
    })
    devicesByUser.delete(userId)
    const keys: DeviceKeys = { ...fresh, identity: { userId, deviceId: registered.id } }
    await store.set('device', {
      id: registered.id,
      signaturePublicKey: toBase64(keys.signaturePublicKey),
      signaturePrivateKey: toBase64(keys.signaturePrivateKey),
    } satisfies StoredDevice)
    await store.set('bundles', [])
    await topUpKeyPackages(keys, true)
    return keys
  }

  const crossSigning = createCrossSigning({ api, store, userId })

  /**
   * Safety codes, new-device warnings and who may be encrypted for: devices signed by the user
   * key known here, and those the person here let in. Nothing else, whatever the server lists.
   */
  const safety = createSafety({
    store,
    userId,
    devicesOf,
    userKeyOf: async (id) =>
      (await api.e2ee.userKey(id === userId ? '@me' : id)).userKey?.publicKey ?? null,
    thisDevice: async () => (await ready()).identity.deviceId,
    thisDeviceKey: async () => {
      await ready()
      return ((await store.get<StoredDevice>('device')) as StoredDevice).signaturePublicKey
    },
  })

  /** Every active device the server lists for these members (device ids). */
  const listedDevices = async (memberIds: readonly string[]): Promise<ReadonlySet<string>> => {
    const lists = await Promise.all(memberIds.map((memberId) => devicesOf(memberId)))
    return new Set(
      lists
        .flat()
        .filter((d) => !d.revokedAt)
        .map((d) => d.id),
    )
  }

  /** The devices of these members a message should reach (device id → user id). */
  const devicesFor = async (
    memberIds: readonly string[],
    keys: DeviceKeys,
  ): Promise<Map<string, string>> => {
    const expected = new Map<string, string>()
    for (const memberId of memberIds) {
      const allowed = await safety.allowedDevices(memberId)
      for (const d of await devicesOf(memberId)) {
        if (!d.revokedAt && allowed.has(d.id)) expected.set(d.id, d.userId)
      }
    }
    // This device is the one writing: it stays whatever its own standing.
    expected.set(keys.identity.deviceId, userId)
    return expected
  }

  /**
   * Decrypts an MLS message of the conversation, with the device that signed it (null for a
   * message of an earlier epoch); null if this device can't read it (call within `serial`).
   */
  const decrypt = async (
    channelId: string,
    ciphertext: string,
  ): Promise<{ payload: EncryptedPayload; sender: DeviceIdentity | null } | null> => {
    const keys = await ready()
    if (!(await conversationOf(channelId))) await sync(channelId, keys)
    const attempt = async () => {
      const conversation = await conversationOf(channelId)
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
      await sync(channelId, keys)
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
  const backup = createHistoryBackup({ api, store, crossSigning })
  const index = createLocalSearch(store)
  /** Backs a message up, sending soon (several messages read together go in one upload). */
  /** What this device last backed up of a message (reactions ride along with it). */
  const backedUp = (messageId: string) => store.get<EncryptedPayload>(`backup:${messageId}`)
  const send_ = async (messageId: string, entry: EncryptedPayload) => {
    await store.set(`backup:${messageId}`, entry)
    backup.add(messageId, entry)
    queueMicrotask(() => void backup.flush().catch(() => undefined))
  }
  const keep = async (messageId: string, payload: EncryptedPayload) => {
    const before = await backedUp(messageId)
    await send_(
      messageId,
      before?.reactionSets ? { ...payload, reactionSets: before.reactionSets } : payload,
    )
  }
  /** Someone's set of reactions, added to its message's backup (if the message is known here). */
  const keepReaction = async (
    messageId: string,
    set: { userId: string; version: string; emojis: readonly string[] },
  ) => {
    const before = await backedUp(messageId)
    if (!before) return
    const others = (before.reactionSets ?? []).filter((s) => s.userId !== set.userId)
    await send_(messageId, {
      ...before,
      reactionSets: [...others, { ...set, emojis: [...set.emojis] }],
    })
  }
  /** A set of reactions this device can't decrypt (it joined later), from the backup. */
  const restoreReaction = async (
    channelId: string,
    messageId: string,
    reaction: { userId: string; version: string },
  ) => {
    const entry = await backup.restore(channelId, messageId).catch(() => null)
    return (
      entry?.reactionSets?.find(
        (s) => s.userId === reaction.userId && s.version === reaction.version,
      )?.emojis ?? null
    )
  }

  /** The device, registered and (where this browser can) vouched for by the user key. */
  const setUp = async (): Promise<DeviceKeys> => {
    const keys = await registerDevice()
    const listed = (await devicesOf(userId)).find((d) => d.id === keys.identity.deviceId)
    try {
      await crossSigning.ensure(keys, Boolean(listed?.userSignature))
      await backup.ensure()
    } catch {
      // Not fatal: the device works unsigned and is approved later.
    }
    devicesByUser.delete(userId)
    return keys
  }

  const ready = async (): Promise<DeviceKeys> => {
    device ??= exclusively(`chinchi-e2ee-device:${userId}`, setUp)
    device.catch(() => {
      device = null
    })
    return device
  }

  const encryptedMemory = createEncryptedMemory(store)
  const membership = createGroupMembership(store)

  const loadState = async (channelId: string): Promise<StoredConversation> =>
    (await store.get<StoredConversation>(`conv:${channelId}`)) ?? {}

  const conversationOf = async (channelId: string): Promise<Conversation | null> => {
    const live = conversations.get(channelId)
    if (live) return live
    const { state } = await loadState(channelId)
    if (!state) return null
    const loaded = loadConversation(fromBase64(state), options)
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
    const bundles = (await store.get<StoredBundle[]>('bundles')) ?? []
    for (const [index, stored] of bundles.entries()) {
      const bundle = {
        publicPackage: fromBase64(stored.publicPackage),
        privatePackage: fromBase64(stored.privatePackage),
      }
      try {
        const joined = await joinConversation(fromBase64(welcome.payload), bundle, options)
        await store.set(
          'bundles',
          bundles.filter((_, i) => i !== index),
        )
        return joined
      } catch {
        // Not the package this Welcome was made for: try the next one.
      }
    }
    return null
  }

  /** Applies the handshakes this device has not seen yet, in the server's order. */
  const sync = async (channelId: string, keys: DeviceKeys) => {
    const { cursor } = await loadState(channelId)
    const { handshakes } = await api.e2ee.handshakes(channelId, {
      deviceId: keys.identity.deviceId,
      ...(cursor ? { after: cursor } : {}),
    })
    let conversation = await conversationOf(channelId)
    let last = cursor
    for (const handshake of handshakes) {
      last = handshake.id
      if (!conversation) {
        if (handshake.kind === 'welcome') conversation = await join(handshake)
        if (conversation) await membership.begin(channelId, peopleIn(conversation))
        continue
      }
      // Commits made from an earlier epoch are already in (our own, or before we joined).
      if (handshake.kind !== 'commit' || handshake.epoch < Number(epoch(conversation))) continue
      const before = conversation
      conversation = (await processIncoming(conversation, fromBase64(handshake.payload)))
        .conversation
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
    made: { conversation: Conversation; commit: Uint8Array; welcome?: Uint8Array },
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
        ? await listedDevices(channel.memberIds)
        : new Set([...expected.keys(), ...(await listedDevices([userId]))])
    const gone = present.filter((m) => !keep.has(m.deviceId))
    if (gone.length > 0) {
      const before = saveConversation(conversation)
      const made = await removeMembers(conversation, gone, options)
      if (!(await commit(channel.id, before, made, Number(epoch(conversation)), keys))) return false
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
    const added = await commit(
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

  /**
   * The conversation caught up and matching the members right now: someone who just left must
   * not get the next message, whether or not anyone has reopened the conversation since.
   */
  const inStep = async (channel: EncryptedChannel, keys: DeviceKeys): Promise<Conversation> => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { conversation } = await sync(channel.id, keys)
      if (!conversation) break
      if (await reconcile(channel, conversation, keys)) {
        const current = await conversationOf(channel.id)
        if (current) return current
      }
    }
    throw new Error('This device is not in the conversation yet')
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
    const started = await commit(
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

  const open = (channel: EncryptedChannel): Promise<ConversationStatus> =>
    serial(channel.id, async () => {
      await encryptedMemory.remember(channel.id)
      const keys = await ready()
      // Fresh device lists: opening is when a member's new or removed devices get noticed.
      for (const memberId of channel.memberIds) devicesByUser.delete(memberId)
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const { conversation, anyCommits } = await sync(channel.id, keys)
        if (!conversation) {
          if (anyCommits) return 'waiting'
          if (await start(channel, keys)) return 'ready'
          continue
        }
        if (await reconcile(channel, conversation, keys)) return 'ready'
      }
      return (await conversationOf(channel.id)) ? 'ready' : 'waiting'
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
      const conversation = await conversationOf(channel.id)
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

    /** Deleted for everyone: nothing of the conversation stays on this device. */
    forgetConversation: (channelId: string) =>
      serial(channelId, async () => {
        conversations.delete(channelId)
        await createConversationEraser(store).forget(channelId)
      }),

    /** Registers this device on first use and keeps its key packages topped up. */
    ready: async () => (await ready()).identity.deviceId,

    /**
     * Signing out: this device leaves every conversation (the server revokes it, members drop
     * it on their next send) and nothing of it stays in the browser: no keys, no plaintext, no
     * recovery key. The next sign-in here is a new device.
     */
    forget: async (): Promise<void> => {
      const saved = await store.get<StoredDevice>('device')
      // Best effort: with the session already gone the local wipe still happens.
      if (saved?.id) await api.e2ee.deleteDevice(saved.id).catch(() => undefined)
      await store.clear()
      device = null
      conversations.clear()
      devicesByUser.clear()
      queues.clear()
      additions.clear()
    },

    open,

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
        const conversation = await inStep(channel, await ready())
        const payload: EncryptedPayload =
          files.length > 0 ? { v: 1, text, files: [...files] } : { v: 1, text }
        const result = await encryptMessage(conversation, encodePayload(payload))
        await persist(channel.id, result.conversation)
        const own: ReadMessage = { payload, sender: VERIFIED }
        // The gateway may echo the message before the request returns: find it by nonce then.
        if (nonce) await store.set(`plain:nonce:${nonce}`, own)
        const { message } = await api.messages.create(channel.id, {
          ciphertext: toBase64(result.ciphertext),
          ...(nonce ? { nonce } : {}),
          ...(files.length > 0 ? { attachmentIds: files.map((file) => file.id) } : {}),
          ...(reply ? { replyTo: reply.messageId, replyMention: reply.mention } : {}),
        })
        await store.set(`plain:${message.id}`, own)
        await keep(message.id, payload)
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
        if (opened) await keep(message.id, opened.payload)
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
        const conversation = await inStep(channel, await ready())
        // Unknown here, its files would be lost: edit it where it can be read.
        const stored = await store.get<ReadMessage | EncryptedPayload>(`plain:${messageId}`)
        if (!stored) throw new Error('This message is not readable on this device')
        const before = storedMessage(stored).payload
        const payload: EncryptedPayload = before.files
          ? { v: 1, text, files: before.files }
          : { v: 1, text }
        const result = await encryptMessage(conversation, encodePayload(payload))
        await persist(channel.id, result.conversation)
        const { message } = await api.messages.update(channel.id, messageId, {
          ciphertext: toBase64(result.ciphertext),
        })
        await store.set(plainKey(message), { payload, sender: VERIFIED } satisfies ReadMessage)
        await keep(messageId, payload)
        await index.record(channel.id, { id: messageId, authorId: userId, text })
        return message
      }),

    /** The key of a call in this conversation for its current epoch; null while waiting. */
    callKey: (channel: EncryptedChannel): Promise<CallKey | null> =>
      serial(channel.id, async () => {
        const { conversation } = await sync(channel.id, await ready())
        if (!conversation) return null
        return {
          epoch: Number(epoch(conversation)),
          key: await exportSecret(conversation, CALL_KEY_LABEL),
        }
      }),

    /** The recovery key: shown to save, typed on a new device to get history and trust back. */
    recovery: {
      key: backup.key,
      saved: backup.saved,
      markSaved: backup.markSaved,
      useKey: async (text: string) => {
        const result = await backup.useKey(text, await ready())
        if (result === 'ok') devicesByUser.delete(userId)
        return result
      },
      /**
       * Lost everything, key included: new keys (with the password); people who checked this
       * user see it.
       */
      reset: async (identity: IdentityProof) => {
        const userKey = await crossSigning.reset(await ready(), identity)
        await backup.reset(userKey)
        devicesByUser.delete(userId)
      },
    },

    ...createEncryptedReactions({
      api,
      store,
      userId,
      serial,
      ready,
      inStep,
      encrypt,
      decrypt,
      keepReaction,
      restoreReaction,
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
      devicesByUser.delete(changedUserId)
      additions.forgetOwner(changedUserId)
    },
  }
}

export type E2eeClient = ReturnType<typeof createE2eeClient>
