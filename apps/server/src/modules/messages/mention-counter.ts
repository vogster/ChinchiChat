import type { GuildRepository } from '../guilds/guild.repository'
import type { GuildAccessChecks } from '../guilds/guild-access'
import type { GuildViews } from '../guilds/guild-views'
import type { ReadStateRepository } from './read-state.repository'
import type { GuildDetail, MentionCounts, Snowflake } from '@chinchi/shared'

export interface MentionCounterDeps {
  readonly guilds: GuildRepository
  readonly access: GuildAccessChecks
  readonly views: GuildViews
  readonly readStates: ReadStateRepository
  /** The user's DMs, where every unread message counts like a mention. */
  readonly privateChannelIds: (userId: Snowflake) => Promise<Snowflake[]>
}

/** Unread mention counts, only over text channels the user can see (no counts leak from others). */
export const createMentionCounter = ({
  guilds,
  access,
  views,
  readStates,
  privateChannelIds,
}: MentionCounterDeps) => {
  const fromDetails = async (
    userId: Snowflake,
    details: readonly GuildDetail[],
    /** The user's DMs when the caller already has them (READY). */
    knownPrivateChannelIds?: readonly Snowflake[],
  ): Promise<MentionCounts> => {
    const [inGuilds, inDms] = await Promise.all([
      readStates.mentionCounts(
        userId,
        details.flatMap((guild) =>
          guild.channels.filter((c) => c.type === 'text' || c.type === 'thread').map((c) => c.id),
        ),
        details.flatMap((guild) => guild.myRoleIds),
      ),
      (knownPrivateChannelIds
        ? Promise.resolve([...knownPrivateChannelIds])
        : privateChannelIds(userId)
      ).then((ids) => readStates.unreadCounts(userId, ids)),
    ])
    return { ...inGuilds, ...inDms }
  }

  return {
    fromDetails,
    async forUser(userId: Snowflake): Promise<MentionCounts> {
      const rows = await guilds.listForUser(userId)
      // A server left (or lost) meanwhile just drops out instead of failing the whole request.
      const settled = await Promise.allSettled(
        rows.map(async (guild) => views.detail(await access.requireMember(guild.id, userId))),
      )
      const details = settled.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : [],
      )
      return fromDetails(userId, details)
    },
  }
}

export type MentionCounter = ReturnType<typeof createMentionCounter>
