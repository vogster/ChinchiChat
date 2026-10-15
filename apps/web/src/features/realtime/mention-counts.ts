import { compareSnowflakes } from '@chinchi/shared'

import { authKeys } from '../auth/queries'
import { guildKeys } from '../guilds/queries'
import { mentionsMe } from '../messages/mentions'
import { flattenPages, messageKeys } from '../messages/queries'

import type { MessagePages, ReadStates } from '../messages/queries'
import type { QueryClient } from '@tanstack/react-query'
import type { CurrentUser, GuildDetail, MentionCounts, Message } from '@chinchi/shared'

/** Sets a channel's count; channels without mentions are left out of the map. */
export const setMentionCount = (
  queryClient: QueryClient,
  channelId: string,
  change: (count: number) => number,
) =>
  queryClient.setQueryData<MentionCounts>(messageKeys.mentionCounts, (counts = {}) => {
    const { [channelId]: current = 0, ...rest } = counts
    const next = Math.max(0, change(current))
    return next > 0 ? { ...rest, [channelId]: next } : rest
  })

/** Whether the message notifies me and is past what I have read (so it counts). */
const countsForMe = (queryClient: QueryClient, message: Message): boolean => {
  const me = queryClient.getQueryData<CurrentUser | null>(authKeys.me)
  if (!me) return false
  const lastRead = queryClient.getQueryData<ReadStates>(messageKeys.readStates)?.[message.channelId]
  // An ack may arrive before an older event: never count what is already read.
  if (lastRead && compareSnowflakes(message.id, lastRead) <= 0) return false
  // In DMs every message from the other side counts.
  if (message.guildId === null) return message.author?.id !== me.id
  const myRoleIds =
    queryClient.getQueryData<GuildDetail>(guildKeys.detail(message.guildId))?.myRoleIds ?? []
  return mentionsMe(message, me.id, myRoleIds)
}

const cached = (queryClient: QueryClient, channelId: string, messageId: string) =>
  flattenPages(queryClient.getQueryData<MessagePages>(messageKeys.channel(channelId))).find(
    (message) => message.id === messageId,
  )

/** The server counts unread DM messages up to this many; the client keeps the same cap. */
const DM_UNREAD_CAP = 100

export const countNewMessage = (queryClient: QueryClient, message: Message) => {
  if (!countsForMe(queryClient, message)) return
  setMentionCount(queryClient, message.channelId, (n) =>
    message.guildId === null ? Math.min(DM_UNREAD_CAP, n + 1) : n + 1,
  )
}

/** Call before the cache is updated: compares with the copy it still holds. */
export const countEdit = (queryClient: QueryClient, edited: Message) => {
  const previous = cached(queryClient, edited.channelId, edited.id)
  if (!previous) return
  const delta =
    Number(countsForMe(queryClient, edited)) - Number(countsForMe(queryClient, previous))
  if (delta !== 0) setMentionCount(queryClient, edited.channelId, (n) => n + delta)
}

/** Call before the cache is updated, while the deleted message is still there. */
export const countDeletion = (queryClient: QueryClient, channelId: string, messageId: string) => {
  const deleted = cached(queryClient, channelId, messageId)
  if (deleted && countsForMe(queryClient, deleted)) {
    setMentionCount(queryClient, channelId, (n) => n - 1)
  }
}
