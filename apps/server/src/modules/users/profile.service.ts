import { HttpError } from '../../http/http-error'
import { profileImageUrl } from '../media/media-paths'
import { toPublicUser } from './user.mapper'

import type { DmRepository } from '../dms/dm.repository'
import type { GuildRepository } from '../guilds/guild.repository'
import type { GuildAccessChecks } from '../guilds/guild-access'
import type { RelationshipRepository } from '../relationships/relationship.repository'
import type { UserRepository, UserRow } from './user.repository'
import type { Snowflake, UserProfile } from '@chinchi/shared'

export interface ProfileServiceDeps {
  readonly users: Pick<UserRepository, 'findById' | 'findByIds'>
  readonly guilds: Pick<GuildRepository, 'listGuildIdsOf' | 'sharesGuild'>
  readonly access: Pick<GuildAccessChecks, 'requireMember'>
  readonly relationships: Pick<RelationshipRepository, 'find' | 'between' | 'friendIdsOf'>
  readonly dms: Pick<DmRepository, 'peerIdsOf'>
}

/** The same answer for "no such user" and "you may not see them": ids can't be probed. */
const unknownUser = () => new HttpError(404, 'UNKNOWN_USER', 'Unknown user')

/** Profiles as one viewer may see them. */
export const createProfileService = ({
  users,
  guilds,
  access,
  relationships,
  dms,
}: ProfileServiceDeps) => {
  /**
   * Visible to themselves; to friends, to people they asked to be friends, and to anyone who
   * shares a server or a DM with them; never to someone they blocked. A relationship row the
   * viewer made alone (their own block or request) opens nothing: anyone can make one.
   */
  const visibleTo = async (viewer: UserRow, target: UserRow) => {
    if (viewer.id === target.id) return true
    const { mine, theirs } = await relationships.between(viewer.id, target.id)
    if (theirs?.type === 'blocked') return false
    if (mine?.type === 'friend' || theirs?.type === 'pending_out') return true
    if (await guilds.sharesGuild(viewer.id, target.id)) return true
    return (await dms.peerIdsOf(viewer.id)).includes(target.id)
  }

  /** Their membership in a server both are in, or null. */
  const membership = async (guildId: Snowflake, viewerId: Snowflake, targetId: Snowflake) => {
    try {
      await access.requireMember(guildId, viewerId)
      const member = await access.requireMember(guildId, targetId)
      return {
        nickname: member.member.nickname,
        roleIds: member.memberRoleIds.filter((id) => id !== guildId),
        joinedAt: member.member.joinedAt.toISOString(),
      }
    } catch (error) {
      if (error instanceof HttpError) return null
      throw error
    }
  }

  return {
    async get(viewer: UserRow, targetId: Snowflake, guildId?: Snowflake): Promise<UserProfile> {
      const target = await users.findById(targetId)
      if (!target || !(await visibleTo(viewer, target))) throw unknownUser()
      const self = viewer.id === target.id
      const [relation, myGuilds, theirGuilds, myFriends, theirFriends, member] = await Promise.all([
        self ? null : relationships.find(viewer.id, target.id),
        guilds.listGuildIdsOf(viewer.id),
        guilds.listGuildIdsOf(target.id),
        relationships.friendIdsOf(viewer.id),
        relationships.friendIdsOf(target.id),
        guildId ? membership(guildId, viewer.id, target.id) : null,
      ])
      const mutualFriendIds = self ? [] : myFriends.filter((id) => theirFriends.includes(id))
      const mutualFriends = await users.findByIds(mutualFriendIds)
      return {
        user: toPublicUser(target),
        bio: target.bio,
        createdAt: target.createdAt.toISOString(),
        bannerUrl: profileImageUrl('banners', target.id, target.bannerId),
        accentColor: target.accentColor,
        relationship: relation?.type ?? null,
        mutualGuildIds: self ? [] : myGuilds.filter((id) => theirGuilds.includes(id)),
        mutualFriends: mutualFriends.map(toPublicUser),
        member,
      }
    },
  }
}

export type ProfileService = ReturnType<typeof createProfileService>
