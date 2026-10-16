import { GROUP_DM_MAX_MEMBERS } from '@chinchi/shared'

import { userTopic } from '../../events/event-bus'
import { badRequest, forbidden, HttpError } from '../../http/http-error'
import { toPrivateChannel } from './dm.mapper'
import { cannotMessage } from './dm.service'

import type { EventBus } from '../../events/event-bus'
import type { AnyChannelRow } from '../channels/channel.repository'
import type { RelationshipRepository } from '../relationships/relationship.repository'
import type { UserRepository, UserRow } from '../users/user.repository'
import type { DmRepository } from './dm.repository'
import type { SystemMessageKind } from '@chinchi/shared'
import type { PrivateChannel, Snowflake } from '@chinchi/shared'

export interface GroupDmServiceDeps {
  readonly dms: DmRepository
  readonly users: UserRepository
  readonly relationships: RelationshipRepository
  readonly events: EventBus
  readonly nextId: () => Snowflake
  /** Writes the group's note about what someone did (a system message). */
  readonly note?: (
    channelId: Snowflake,
    actorId: Snowflake,
    system: { kind: SystemMessageKind; targetId?: Snowflake; name?: string },
  ) => Promise<void>
}

const unknownChannel = () => new HttpError(404, 'UNKNOWN_CHANNEL', 'Unknown channel')

/** Group DMs: started with friends, any member may bring in theirs, the owner may remove. */
export const createGroupDmService = ({
  dms,
  users,
  relationships,
  events,
  nextId,
  note = async () => undefined,
}: GroupDmServiceDeps) => {
  /** Only friends can be brought into a group: unknown users get 404, everyone else 403. */
  const requireFriend = async (me: Snowflake, userId: Snowflake) => {
    if (!(await users.findById(userId))) throw new HttpError(404, 'UNKNOWN_USER', 'Unknown user')
    if ((await relationships.find(me, userId))?.type !== 'friend') throw cannotMessage()
  }

  /** A group DM the user is in; hidden (404) from everyone else. */
  const requireGroup = async (channelId: Snowflake, userId: Snowflake) => {
    const channel = await dms.findPrivate(channelId)
    if (!channel || !(await dms.isRecipient(channelId, userId))) throw unknownChannel()
    if (channel.type !== 'group_dm') {
      throw badRequest('NOT_GROUP_DM', 'Only group DMs have members to manage')
    }
    return channel
  }

  const membersOf = async (channelId: Snowflake) =>
    (await dms.recipientsOf([channelId])).get(channelId) ?? []

  /** Tells each of `to` about the channel, as they see it. */
  const announce = (
    channel: AnyChannelRow,
    type: 'PRIVATE_CHANNEL_CREATE' | 'PRIVATE_CHANNEL_UPDATE',
    members: readonly UserRow[],
    to: readonly UserRow[],
  ) =>
    Promise.all(
      to.map((member) =>
        events.publish({
          topic: userTopic(member.id),
          type,
          data: toPrivateChannel(channel, members, member.id),
        }),
      ),
    )

  return {
    async create(
      me: UserRow,
      recipientIds: readonly Snowflake[],
      { encrypted = false }: { encrypted?: boolean } = {},
    ): Promise<PrivateChannel> {
      if (recipientIds.includes(me.id)) {
        throw badRequest('INVALID_RECIPIENTS', 'You cannot add yourself')
      }
      for (const id of recipientIds) await requireFriend(me.id, id)
      const channel = await dms.createGroup(nextId(), me.id, [me.id, ...recipientIds], {
        encrypted,
      })
      const members = await membersOf(channel.id)
      await announce(channel, 'PRIVATE_CHANNEL_CREATE', members, members)
      return toPrivateChannel(channel, members, me.id)
    },

    async addRecipient(me: UserRow, channelId: Snowflake, userId: Snowflake): Promise<void> {
      const channel = await requireGroup(channelId, me.id)
      if (userId === me.id) return
      await requireFriend(me.id, userId)
      const result = await dms.addRecipientChecked(channelId, me.id, userId, GROUP_DM_MAX_MEMBERS)
      if (result === 'not_member') throw unknownChannel()
      if (result === 'full') throw badRequest('GROUP_DM_FULL', 'This group is full')
      if (result === 'exists') return
      const members = await membersOf(channelId)
      await Promise.all([
        announce(
          channel,
          'PRIVATE_CHANNEL_CREATE',
          members,
          members.filter((m) => m.id === userId),
        ),
        announce(
          channel,
          'PRIVATE_CHANNEL_UPDATE',
          members,
          members.filter((m) => m.id !== userId),
        ),
      ])
      await note(channelId, me.id, { kind: 'recipient_add', targetId: userId })
    },

    /** The owner removes others; anyone may leave. */
    async removeRecipient(me: UserRow, channelId: Snowflake, userId: Snowflake): Promise<void> {
      await requireGroup(channelId, me.id)
      // Ownership is checked again under the row lock: it may change in the meantime.
      const result = await dms.removeRecipient(channelId, me.id, userId)
      if (result.result !== 'removed') {
        if (result.result === 'not_member') throw unknownChannel()
        if (result.result === 'forbidden') {
          throw forbidden('MISSING_PERMISSIONS', 'Only the owner can remove people')
        }
        return
      }
      await events.publish({
        topic: userTopic(userId),
        type: 'PRIVATE_CHANNEL_DELETE',
        data: { id: channelId },
      })
      if (result.channel) {
        const members = await membersOf(channelId)
        await announce(result.channel, 'PRIVATE_CHANNEL_UPDATE', members, members)
        await note(
          channelId,
          me.id,
          userId === me.id ? { kind: 'leave' } : { kind: 'recipient_remove', targetId: userId },
        )
      }
    },

    /** Any member may name the group; an empty name goes back to listing the members. */
    async rename(me: UserRow, channelId: Snowflake, name: string | null): Promise<PrivateChannel> {
      await requireGroup(channelId, me.id)
      const channel = await dms.rename(channelId, name ?? '')
      if (!channel) throw unknownChannel()
      const members = await membersOf(channelId)
      await announce(channel, 'PRIVATE_CHANNEL_UPDATE', members, members)
      await note(channelId, me.id, name ? { kind: 'rename', name } : { kind: 'rename' })
      return toPrivateChannel(channel, members, me.id)
    },
  }
}

export type GroupDmService = ReturnType<typeof createGroupDmService>
