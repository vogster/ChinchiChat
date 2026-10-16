import { collectMentions, parseMarkdown } from '@chinchi/markdown'
import { has, Permission } from '@chinchi/shared'

import { HttpError } from '../../http/http-error'

import type { AutomodService } from '../automod/automod.service'
import type { Slowmode } from './slowmode'
import type { Snowflake } from '@chinchi/shared'

/** Checks a message must pass before it is stored: automod, then (later) slowmode. */
export const createMessageGuards = ({
  slowmode,
  automod,
}: {
  slowmode: Slowmode
  automod: Pick<AutomodService, 'check'> | undefined
}) => {
  /** Server messages pass automod first (it ignores moderators). */
  const screen = async (
    channel: { guildId: Snowflake | null; rateLimitPerUser: number },
    authorId: Snowflake,
    content: string,
    permissions: bigint,
    isNew: boolean,
  ) => {
    if (!automod || !channel.guildId) return
    const attempted = collectMentions(parseMarkdown(content))
    await automod.check({
      guildId: channel.guildId,
      authorId,
      content,
      // What the author tried to mention, allowed or not: mass pings are the point.
      mentionCount:
        attempted.users.length +
        attempted.roles.length +
        (attempted.everyone || attempted.here ? 1 : 0),
      permissions,
      isNew,
      slowmode: channel.rateLimitPerUser > 0,
    })
  }

  /** Moderators skip slowmode; everyone else waits their turn. */
  const takeSlowmodeTurn = async (
    channel: { id: Snowflake; rateLimitPerUser: number },
    userId: Snowflake,
    permissions: bigint,
  ) => {
    if (channel.rateLimitPerUser <= 0) return
    if (
      has(permissions, Permission.ManageMessages) ||
      has(permissions, Permission.ManageChannels)
    ) {
      return
    }
    if (!(await slowmode.take(channel.id, userId, channel.rateLimitPerUser))) {
      throw new HttpError(429, 'SLOWMODE', 'Slowmode is on: wait before sending again')
    }
  }

  return { screen, takeSlowmodeTurn }
}
