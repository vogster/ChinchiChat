import { useQuery } from '@tanstack/react-query'

import { mentionCountsQueryOptions } from './queries'

import type { Message, Snowflake } from '@chinchi/shared'

/** Whether a message notifies me: by name, through one of my roles, @everyone or @here. */
export const mentionsMe = (
  message: Pick<Message, 'author' | 'mentions'>,
  myId: Snowflake,
  myRoleIds: readonly Snowflake[],
): boolean =>
  message.author?.id !== myId &&
  (message.mentions.everyone ||
    message.mentions.here ||
    message.mentions.users.includes(myId) ||
    message.mentions.roles.some((roleId) => myRoleIds.includes(roleId)))

/** Unread mentions per channel; empty until known. */
export const useMentionCounts = () => useQuery(mentionCountsQueryOptions()).data ?? {}

/** "3", or "99+" past what fits in a badge. */
export const formatMentionCount = (count: number) => (count > 99 ? '99+' : String(count))
