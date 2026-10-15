import { ApiError } from '@chinchi/sdk'
import {
  addMembers,
  createConversation,
  createDeviceKeys,
  createKeyPackages,
  encryptMessage,
  epoch,
  joinConversation,
  loadConversation,
  members,
  processIncoming,
  removeMembers,
  saveConversation,
} from '@chinchi/e2ee'

import { decodePayload, encodePayload, fromBase64, toBase64 } from './codec'

import type { EncryptedPayload } from './codec'
import type { E2eeStore } from './store'
import type { ApiClient } from '@chinchi/sdk'
import type { Conversation, ConversationOptions, DeviceKeys, KeyPackageBundle } from '@chinchi/e2ee'
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
  >
  readonly messages: {
    create(
      channelId: string,
      body: { ciphertext: string; nonce?: string },
    ): Promise<{ message: { id: string; ciphertext: string | null } }>
  }
}

/** An encrypted conversation as the client needs it: its channel and everyone in it. */
export interface EncryptedChannel {
  readonly id: string
  readonly memberIds: readonly string[]
}

/** A message from the server: its id and MLS ciphertext (and the sender's nonce, for its author). */
export interface CipherMessage {
  readonly id: string
  readonly ciphertext: string | null
  readonly nonce?: string | null
}

/** ready: this device is in the conversation; waiting: another device has to let it in. */
export type ConversationStatus = 'ready' | 'waiting'

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

export const createE2eeClient = ({ api, store, userId, deviceName }: E2eeClientOptions) => {
  let device: Promise<DeviceKeys> | null = null
  const devicesByUser = new Map<string, Promise<Device[]>>()
  const conversations = new Map<string, Conversation>()
  const queues = new Map<string, Promise<unknown>>()

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

  const ready = async (): Promise<DeviceKeys> => {
    device ??= exclusively(`chinchi-e2ee-device:${userId}`, registerDevice)
    device.catch(() => {
      device = null
    })
    return device
  }

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
        continue
      }
      // Commits made from an earlier epoch are already in (our own, or before we joined).
      if (handshake.kind !== 'commit' || handshake.epoch < Number(epoch(conversation))) continue
      conversation = (await processIncoming(conversation, fromBase64(handshake.payload)))
        .conversation
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
    const expected = new Map<string, string>()
    for (const memberId of channel.memberIds) {
      for (const d of await devicesOf(memberId)) if (!d.revokedAt) expected.set(d.id, d.userId)
    }
    const present = members(conversation).map((m) => m.identity)
    const gone = present.filter((m) => !expected.has(m.deviceId))
    if (gone.length > 0) {
      const before = saveConversation(conversation)
      const made = await removeMembers(conversation, gone, options)
      if (!(await commit(channel.id, before, made, Number(epoch(conversation)), keys))) return false
      conversation = made.conversation
    }
    const missing = [...expected].filter(([id]) => !present.some((m) => m.deviceId === id))
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
    return commit(
      channel.id,
      before,
      made,
      Number(epoch(conversation)),
      keys,
      claimed.map((k) => ({ deviceId: k.deviceId, keyPackageId: k.keyPackageId })),
    )
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
    const others = new Map<string, string>()
    for (const memberId of channel.memberIds) {
      for (const d of await devicesOf(memberId)) {
        if (d.id !== keys.identity.deviceId && !d.revokedAt) others.set(d.id, d.userId)
      }
    }
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
    return commit(
      channel.id,
      null,
      made,
      0,
      keys,
      claimed.map((k) => ({ deviceId: k.deviceId, keyPackageId: k.keyPackageId })),
    )
  }

  const open = (channel: EncryptedChannel): Promise<ConversationStatus> =>
    serial(channel.id, async () => {
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
    /** Registers this device on first use and keeps its key packages topped up. */
    ready: async () => (await ready()).identity.deviceId,

    open,

    /** Encrypts and sends; the plaintext is kept, since the sender can't decrypt its own. */
    send: (channel: EncryptedChannel, text: string, nonce?: string): Promise<CipherMessage> =>
      serial(channel.id, async () => {
        const keys = await ready()
        const { conversation } = await sync(channel.id, keys)
        if (!conversation) throw new Error('This device is not in the conversation yet')
        const payload: EncryptedPayload = { v: 1, text }
        const result = await encryptMessage(conversation, encodePayload(payload))
        await persist(channel.id, result.conversation)
        // The gateway may echo the message before the request returns: find it by nonce then.
        if (nonce) await store.set(`plain:nonce:${nonce}`, payload)
        const { message } = await api.messages.create(channel.id, {
          ciphertext: toBase64(result.ciphertext),
          ...(nonce ? { nonce } : {}),
        })
        await store.set(`plain:${message.id}`, payload)
        return message
      }),

    /** The payload of a message, decrypted once and then remembered; null when unreadable here. */
    read: (channel: EncryptedChannel, message: CipherMessage): Promise<EncryptedPayload | null> =>
      serial(channel.id, async () => {
        const known =
          (await store.get<EncryptedPayload>(`plain:${message.id}`)) ??
          (message.nonce
            ? await store.get<EncryptedPayload>(`plain:nonce:${message.nonce}`)
            : undefined)
        if (known) return known
        if (!message.ciphertext) return null
        const keys = await ready()
        if (!(await conversationOf(channel.id))) await sync(channel.id, keys)
        const attempt = async () => {
          const conversation = await conversationOf(channel.id)
          if (!conversation) return null
          const result = await processIncoming(
            conversation,
            fromBase64(message.ciphertext as string),
          )
          await persist(channel.id, result.conversation)
          return result.incoming.kind === 'message'
            ? decodePayload(result.incoming.plaintext)
            : null
        }
        let payload: EncryptedPayload | null
        try {
          payload = await attempt()
        } catch {
          // Maybe sent after a commit this device hasn't applied: catch up and try again.
          await sync(channel.id, keys)
          payload = await attempt().catch(() => null)
        }
        if (payload) await store.set(`plain:${message.id}`, payload)
        return payload
      }),

    /** A member's devices changed: forget the cached list (the next open reconciles). */
    devicesChanged: async (changedUserId: string) => {
      devicesByUser.delete(changedUserId)
    },
  }
}

export type E2eeClient = ReturnType<typeof createE2eeClient>
