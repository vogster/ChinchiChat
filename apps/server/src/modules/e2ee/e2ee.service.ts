import { DEVICES_MAX_PER_USER, KEY_PACKAGES_MAX_PER_DEVICE } from '@chinchi/shared'

import { userTopic } from '../../events/event-bus'
import { HttpError, badRequest, conflict } from '../../http/http-error'

import type { EventBus } from '../../events/event-bus'
import type { ChannelEvents } from '../channels/channel-events'
import type { ChannelService } from '../channels/channel.service'
import type { DmRepository } from '../dms/dm.repository'
import type { GuildRepository } from '../guilds/guild.repository'
import type { RelationshipRepository } from '../relationships/relationship.repository'
import type { DeviceRow, E2eeRepository, HandshakeRow } from './e2ee.repository'
import type {
  ClaimedKeyPackage,
  Device,
  Handshake,
  PostCommitRequest,
  RegisterDeviceRequest,
  Snowflake,
  UploadKeyPackagesRequest,
} from '@chinchi/shared'

export interface E2eeServiceDeps {
  readonly e2ee: E2eeRepository
  readonly guilds: Pick<GuildRepository, 'sharesGuild'>
  readonly relationships: Pick<RelationshipRepository, 'find'>
  readonly dms: Pick<DmRepository, 'recipientIds'>
  readonly channels: Pick<ChannelService, 'resolve'>
  readonly channelEvents: ChannelEvents
  readonly events: EventBus
  readonly nextId: () => Snowflake
}

const unknownDevice = () => new HttpError(404, 'UNKNOWN_DEVICE', 'Unknown device')
const unknownUser = () => new HttpError(404, 'UNKNOWN_USER', 'Unknown user')

const toDevice = (row: DeviceRow): Device => ({
  id: row.id,
  userId: row.userId,
  name: row.name,
  signaturePublicKey: row.signaturePublicKey,
  createdAt: row.createdAt.toISOString(),
  revokedAt: row.revokedAt?.toISOString() ?? null,
})

export const toHandshake = (row: HandshakeRow): Handshake => ({
  id: row.id,
  channelId: row.channelId,
  kind: row.kind,
  epoch: row.epoch,
  senderDeviceId: row.senderDeviceId,
  targetDeviceId: row.targetDeviceId,
  keyPackageId: row.keyPackageId,
  payload: row.payload,
})

/**
 * The server side of encrypted conversations: a directory of devices and their key packages,
 * and the MLS delivery service, which only orders and passes on what it cannot read.
 */
export const createE2eeService = ({
  e2ee,
  guilds,
  relationships,
  dms,
  channels,
  channelEvents,
  events,
  nextId,
}: E2eeServiceDeps) => {
  /** Devices are visible to people one may already reach: server mates, friends, DM partners. */
  const assertMaySee = async (viewerId: Snowflake, userId: Snowflake) => {
    if (viewerId === userId) return
    const [mate, relation, partner] = await Promise.all([
      guilds.sharesGuild(viewerId, userId),
      relationships.find(viewerId, userId),
      e2ee.sharePrivateChannel(viewerId, userId),
    ])
    if (!mate && relation?.type !== 'friend' && !partner) throw unknownUser()
  }

  /** One of the user's devices that is still in use. */
  const ownDevice = async (userId: Snowflake, deviceId: Snowflake) => {
    const device = await e2ee.findDevice(deviceId)
    if (device?.userId !== userId || device.revokedAt) throw unknownDevice()
    return device
  }

  /** The user and everyone sharing an encrypted conversation re-check its devices. */
  const announceDevices = async (userId: Snowflake) => {
    const peers = await e2ee.peerIds(userId)
    await Promise.all(
      [userId, ...peers].map((id) =>
        events.publish({ topic: userTopic(id), type: 'E2EE_DEVICES_UPDATE', data: { userId } }),
      ),
    )
  }

  const encryptedChannel = async (channelId: Snowflake, userId: Snowflake) => {
    const { channel } = await channels.resolve(channelId, userId)
    if (!channel.encrypted) throw badRequest('NOT_ENCRYPTED', 'This conversation is not encrypted')
    return channel
  }

  return {
    async listDevices(viewerId: Snowflake, userId: Snowflake): Promise<Device[]> {
      await assertMaySee(viewerId, userId)
      return (await e2ee.listDevices(userId)).map(toDevice)
    },

    async registerDevice(userId: Snowflake, body: RegisterDeviceRequest): Promise<Device> {
      // A retry of my own registration (the page reloaded before it saved the answer) gets the
      // same device back; a key someone else holds, or a revoked one, is refused below.
      const existing = await e2ee.findDeviceByKey(body.signaturePublicKey)
      if (existing?.userId === userId && existing.revokedAt === null) return toDevice(existing)
      const active = (await e2ee.listDevices(userId)).filter((d) => d.revokedAt === null)
      if (active.length >= DEVICES_MAX_PER_USER) {
        throw badRequest('TOO_MANY_DEVICES', 'Remove a device first')
      }
      const row = await e2ee.insertDevice({
        id: nextId(),
        userId,
        name: body.name,
        signaturePublicKey: body.signaturePublicKey,
      })
      if (!row) throw conflict('DEVICE_EXISTS', 'This device is already registered')
      await announceDevices(userId)
      return toDevice(row)
    },

    async deleteDevice(userId: Snowflake, deviceId: Snowflake): Promise<void> {
      if (!(await e2ee.revokeDevice(deviceId, userId))) throw unknownDevice()
      await announceDevices(userId)
    },

    async uploadKeyPackages(
      userId: Snowflake,
      deviceId: Snowflake,
      body: UploadKeyPackagesRequest,
    ): Promise<void> {
      await ownDevice(userId, deviceId)
      const held = await e2ee.countKeyPackages(deviceId)
      if (held + body.packages.length > KEY_PACKAGES_MAX_PER_DEVICE) {
        throw badRequest('TOO_MANY_KEY_PACKAGES', 'The device holds enough key packages')
      }
      await e2ee.addKeyPackages(
        deviceId,
        body.packages.map((pkg) => ({ id: nextId(), package: pkg })),
        body.lastResort ? { id: nextId(), package: body.lastResort } : undefined,
      )
    },

    async countKeyPackages(userId: Snowflake, deviceId: Snowflake): Promise<number> {
      await ownDevice(userId, deviceId)
      return e2ee.countKeyPackages(deviceId)
    },

    /** One key package per device of the user (devices that ran out are left out). */
    async claimKeyPackages(viewerId: Snowflake, userId: Snowflake): Promise<ClaimedKeyPackage[]> {
      await assertMaySee(viewerId, userId)
      const devices = (await e2ee.listDevices(userId)).filter((d) => d.revokedAt === null)
      const claimed = await Promise.all(
        devices.map(async (device) => {
          const found = await e2ee.claimKeyPackage(device.id)
          return found
            ? [{ deviceId: device.id, keyPackageId: found.id, package: found.package }]
            : []
        }),
      )
      return claimed.flat()
    },

    /**
     * Takes a commit made from `epoch` (409 STALE_EPOCH if another came first) and passes it
     * to everyone in the conversation, and each Welcome to the user of its device.
     */
    async postCommit(
      userId: Snowflake,
      channelId: Snowflake,
      body: PostCommitRequest,
    ): Promise<void> {
      const channel = await encryptedChannel(channelId, userId)
      await ownDevice(userId, body.deviceId)
      const memberIds = new Set(await dms.recipientIds(channel.id))
      const targets = await Promise.all(
        (body.welcomeTargets ?? []).map(async (target) => {
          const device = await e2ee.findDevice(target.deviceId)
          if (!device || device.revokedAt || !memberIds.has(device.userId)) {
            throw badRequest('UNKNOWN_DEVICE', 'A Welcome is for a device outside the conversation')
          }
          return { ...target, userId: device.userId }
        }),
      )
      const result = await e2ee.commit(channel.id, body.epoch, [
        {
          id: nextId(),
          kind: 'commit',
          senderDeviceId: body.deviceId,
          targetDeviceId: null,
          keyPackageId: null,
          payload: body.commit,
        },
        ...targets.map((target) => ({
          id: nextId(),
          kind: 'welcome' as const,
          senderDeviceId: body.deviceId,
          targetDeviceId: target.deviceId,
          keyPackageId: target.keyPackageId,
          payload: body.welcome as string,
        })),
      ])
      if (result === 'stale') throw conflict('STALE_EPOCH', 'Another commit came first')
      for (const row of result) {
        const target = targets.find((t) => t.deviceId === row.targetDeviceId)
        if (target) {
          await events.publish({
            topic: userTopic(target.userId),
            type: 'E2EE_HANDSHAKE',
            data: toHandshake(row),
          })
        } else {
          await channelEvents.publish(channel, 'E2EE_HANDSHAKE', toHandshake(row))
        }
      }
    },

    async listHandshakes(
      userId: Snowflake,
      channelId: Snowflake,
      deviceId: Snowflake,
      after: Snowflake | undefined,
    ): Promise<Handshake[]> {
      const channel = await encryptedChannel(channelId, userId)
      await ownDevice(userId, deviceId)
      return (await e2ee.listHandshakes(channel.id, deviceId, after)).map(toHandshake)
    },
  }
}

export type E2eeService = ReturnType<typeof createE2eeService>
