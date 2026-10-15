import { Permission } from '@chinchi/shared'

import { userTopic } from '../../events/event-bus'
import { HttpError, badRequest, forbidden } from '../../http/http-error'
import { toPrivateChannel } from './dm.mapper'

import type { EventBus } from '../../events/event-bus'
import type { AnyChannelRow } from '../channels/channel.repository'
import type { GuildRepository } from '../guilds/guild.repository'
import type { RelationshipRepository } from '../relationships/relationship.repository'
import type { UserRepository, UserRow } from '../users/user.repository'
import type { DmRepository } from './dm.repository'
import type { PrivateChannel, Snowflake } from '@chinchi/shared'

/** What members of a DM may do: talk, never moderate or ping everyone. */
export const DM_PERMISSIONS =
  Permission.ViewChannel |
  Permission.SendMessages |
  Permission.ReadMessageHistory |
  Permission.AddReactions |
  Permission.AttachFiles |
  Permission.EmbedLinks |
  Permission.Connect |
  Permission.Speak |
  Permission.Video

/** Taken away from both people in a 1:1 DM when either blocked the other. */
const TALKING =
  Permission.SendMessages |
  Permission.AddReactions |
  Permission.AttachFiles |
  Permission.Connect |
  Permission.Speak |
  Permission.Video

export interface DmServiceDeps {
  readonly dms: DmRepository
  readonly users: UserRepository
  readonly guilds: GuildRepository
  readonly relationships: RelationshipRepository
  readonly events: EventBus
  readonly nextId: () => Snowflake
}

export const cannotMessage = () =>
  forbidden('CANNOT_MESSAGE_USER', "You can't send messages to this user")

export const createDmService = ({
  dms,
  users,
  guilds,
  relationships,
  events,
  nextId,
}: DmServiceDeps) => {
  /**
   * Whether two people may talk 1:1: friends always; people who share a server only if both take
   * DMs from server mates (a friends-only user can't start what the other could not answer);
   * nobody across a block.
   */
  const mayMessage = async (
    me: UserRow,
    them: UserRow,
    known?: Awaited<ReturnType<RelationshipRepository['between']>>,
  ) => {
    // Bots have no DM list and can't block anyone: they talk on servers only.
    if (me.isBot || them.isBot) return false
    const { mine, theirs } = known ?? (await relationships.between(me.id, them.id))
    if (mine?.type === 'blocked' || theirs?.type === 'blocked') return false
    if (mine?.type === 'friend') return true
    return (
      me.dmPolicy === 'servers' &&
      them.dmPolicy === 'servers' &&
      (await guilds.sharesGuild(me.id, them.id))
    )
  }

  const describeFor = async (channel: AnyChannelRow, viewerId: Snowflake) => {
    const members = (await dms.recipientsOf([channel.id])).get(channel.id) ?? []
    return { members, view: toPrivateChannel(channel, members, viewerId) }
  }

  return {
    /** Permissions in a DM, or null if the user is not in it (the caller answers 404). */
    async permissionsIn(channel: AnyChannelRow, userId: Snowflake): Promise<bigint | null> {
      const memberIds = await dms.recipientIds(channel.id)
      if (!memberIds.includes(userId)) return null
      if (channel.type !== 'dm') return DM_PERMISSIONS
      // Checked on every message: a block, a privacy change or leaving the last shared server
      // ends the conversation.
      const otherId = memberIds.find((id) => id !== userId)
      if (!otherId) return DM_PERMISSIONS & ~TALKING
      // Both people and both sides of their relationship, in two parallel queries.
      const [people, between] = await Promise.all([
        users.findByIds([userId, otherId]),
        relationships.between(userId, otherId),
      ])
      const me = people.find((u) => u.id === userId)
      const other = people.find((u) => u.id === otherId)
      return me && other && (await mayMessage(me, other, between))
        ? DM_PERMISSIONS
        : DM_PERMISSIONS & ~TALKING
    },

    async list(userId: Snowflake): Promise<PrivateChannel[]> {
      const channels = await dms.listForUser(userId)
      const members = await dms.recipientsOf(channels.map((channel) => channel.id))
      return channels.map((channel) =>
        toPrivateChannel(channel, members.get(channel.id) ?? [], userId),
      )
    },

    /** Opens (or finds) the 1:1 DM with one person. */
    async open(me: UserRow, targetId: Snowflake): Promise<PrivateChannel> {
      if (targetId === me.id) throw badRequest('INVALID_RECIPIENTS', "You can't message yourself")
      const target = await users.findById(targetId)
      if (!target) throw new HttpError(404, 'UNKNOWN_USER', 'Unknown user')
      if (!(await mayMessage(me, target))) throw cannotMessage()

      const { channel, created } = await dms.openDm(nextId(), me.id, target.id)
      const { members, view } = await describeFor(channel, me.id)
      if (created) {
        await Promise.all(
          members.map((member) =>
            events.publish({
              topic: userTopic(member.id),
              type: 'PRIVATE_CHANNEL_CREATE',
              data: toPrivateChannel(channel, members, member.id),
            }),
          ),
        )
      }
      return view
    },

    /** The encrypted conversation with one person, started if missing (same rules as a DM). */
    async openEncrypted(me: UserRow, targetId: Snowflake): Promise<PrivateChannel> {
      if (targetId === me.id) throw badRequest('INVALID_RECIPIENTS', "You can't message yourself")
      const target = await users.findById(targetId)
      if (!target) throw new HttpError(404, 'UNKNOWN_USER', 'Unknown user')
      if (!(await mayMessage(me, target))) throw cannotMessage()
      const { channel, created } = await dms.openDm(nextId(), me.id, target.id, {
        encrypted: true,
      })
      const { members, view } = await describeFor(channel, me.id)
      if (!created) return view
      await Promise.all(
        members.map((member) =>
          events.publish({
            topic: userTopic(member.id),
            type: 'PRIVATE_CHANNEL_CREATE',
            data: toPrivateChannel(channel, members, member.id),
          }),
        ),
      )
      return view
    },

    privateChannelIds: async (userId: Snowflake) =>
      (await dms.listForUser(userId)).map((channel) => channel.id),
  }
}

export type DmService = ReturnType<typeof createDmService>
