import { guildTopic, userTopic } from '../../events/event-bus'
import { toPublicUser } from './user.mapper'

import type { EventBus } from '../../events/event-bus'
import type { DmRepository } from '../dms/dm.repository'
import type { GuildRepository } from '../guilds/guild.repository'
import type { RelationshipRepository } from '../relationships/relationship.repository'
import type { UserRow } from './user.repository'

export interface ProfileEventsDeps {
  readonly events: EventBus
  readonly guilds: Pick<GuildRepository, 'listGuildIdsOf'>
  readonly relationships: Pick<RelationshipRepository, 'holdersOf' | 'blockedAround'>
  readonly dms: Pick<DmRepository, 'peerIdsOf'>
}

/**
 * Announces a changed public profile to everyone whose screen may show it: the user's servers,
 * their own other devices, people whose friends list or requests include them, DM partners.
 */
export const createProfileEvents = ({ events, guilds, relationships, dms }: ProfileEventsDeps) => ({
  async publish(user: UserRow): Promise<void> {
    const [guildIds, holders, peers, blocked] = await Promise.all([
      guilds.listGuildIdsOf(user.id),
      relationships.holdersOf(user.id),
      dms.peerIdsOf(user.id),
      relationships.blockedAround(user.id),
    ])
    // A DM stays after a block, but the profile no longer follows it there.
    const reachablePeers = peers.filter((id) => !blocked.includes(id))
    const userIds = new Set([user.id, ...holders, ...reachablePeers])
    const topics = [...guildIds.map(guildTopic), ...[...userIds].map(userTopic)]
    const data = toPublicUser(user)
    await Promise.all(topics.map((topic) => events.publish({ topic, type: 'USER_UPDATE', data })))
  },
})

export type ProfileEvents = ReturnType<typeof createProfileEvents>
