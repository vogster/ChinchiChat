import { collectMentions, parseMarkdown } from '@chinchi/markdown'
import { Permission, has } from '@chinchi/shared'

import type { GuildRepository } from '../guilds/guild.repository'
import type { RoleRepository } from '../roles/role.repository'
import type { MessageMentions, Snowflake } from '@chinchi/shared'

export interface MentionResolverDeps {
  readonly guilds: GuildRepository
  readonly roles: RoleRepository
  /** Members of a DM: there only they can be mentioned. */
  readonly recipientIds: (channelId: Snowflake) => Promise<Snowflake[]>
}

export interface MentionInput {
  readonly content: string
  readonly channelId: Snowflake
  /** null in DMs: no roles or @everyone there, only the members. */
  readonly guildId: Snowflake | null
  readonly authorId: Snowflake
  /** The author's permissions in the channel. */
  readonly permissions: bigint
  /** Author of the replied-to message, when the reply notifies them. */
  readonly repliedAuthorId?: Snowflake | null | undefined
}

const unique = (ids: readonly Snowflake[]) => [...new Set(ids)]

/** More distinct users than this in one message are ignored (spam, not conversation). */
export const MAX_USER_MENTIONS = 50

/** Who a message really notifies: the markdown's mentions, checked against the server. */
export const createMentionResolver = ({ guilds, roles, recipientIds }: MentionResolverDeps) => {
  return async ({
    content,
    channelId,
    guildId,
    authorId,
    permissions,
    repliedAuthorId,
  }: MentionInput): Promise<MessageMentions> => {
    const found = collectMentions(parseMarkdown(content))
    const canMentionEveryone = has(permissions, Permission.MentionEveryone)

    const candidates = unique([...found.users, ...(repliedAuthorId ? [repliedAuthorId] : [])])
      .filter((id) => id !== authorId)
      // Parsed ids are bounded by the message length; this keeps the query small anyway.
      .slice(0, MAX_USER_MENTIONS)
    if (guildId === null) {
      if (candidates.length === 0) return { users: [], roles: [], everyone: false, here: false }
      const members = new Set(await recipientIds(channelId))
      return {
        users: candidates.filter((id) => members.has(id)),
        roles: [],
        everyone: false,
        here: false,
      }
    }
    const members = new Set(await guilds.filterMembers(guildId, candidates))

    const wantsRoles = found.roles.filter((id) => id !== guildId)
    const guildRoles = wantsRoles.length > 0 ? await roles.listByGuild(guildId) : []
    const allowedRoles = new Set(
      guildRoles
        .filter((role) => role.id !== guildId && (role.mentionable || canMentionEveryone))
        .map((role) => role.id),
    )

    return {
      users: candidates.filter((id) => members.has(id)),
      roles: wantsRoles.filter((id) => allowedRoles.has(id)),
      everyone: canMentionEveryone && found.everyone,
      // Not expanded to the members online: that list could be huge on a big server.
      here: canMentionEveryone && found.here,
    }
  }
}

export type MentionResolver = ReturnType<typeof createMentionResolver>
