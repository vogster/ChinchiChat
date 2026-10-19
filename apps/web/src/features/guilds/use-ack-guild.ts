import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useApi } from '../../lib/api-context'
import { messageKeys } from '../messages/queries'

import type { ReadStates } from '../messages/queries'
import type { Channel, GuildDetail, MentionCounts } from '@chinchi/shared'
import type { QueryClient } from '@tanstack/react-query'

/** Channels with messages to read, each with its newest message. */
const readable = (channels: readonly Channel[]) =>
  channels.flatMap((channel) =>
    (channel.type === 'text' || channel.type === 'thread') && channel.lastMessageId
      ? [[channel.id, channel.lastMessageId] as const]
      : [],
  )

/** Shows the channels as read at once (and without mentions); the server catches up behind. */
const markReadHere = (queryClient: QueryClient, channels: readonly Channel[]) => {
  queryClient.setQueryData<ReadStates>(messageKeys.readStates, (states) => ({
    ...states,
    ...Object.fromEntries(readable(channels)),
  }))
  const ids = new Set(channels.map((channel) => channel.id))
  queryClient.setQueryData<MentionCounts>(messageKeys.mentionCounts, (counts = {}) =>
    Object.fromEntries(Object.entries(counts).filter(([id]) => !ids.has(id))),
  )
}

/** "Mark as read" for a whole server. */
export const useAckGuild = () => {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (guild: GuildDetail) => api.guilds.ack(guild.id),
    onMutate: (guild) => markReadHere(queryClient, guild.channels),
  })
}

/**
 * "Mark as read" for some channels (a category's, with their threads): each one read up to its
 * newest message. Only those with something unread are given, so the requests stay few.
 */
export const useAckChannels = () => {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (channels: readonly Channel[]) =>
      Promise.all(readable(channels).map(([id, last]) => api.messages.ack(id, last))),
    onMutate: (channels) => markReadHere(queryClient, channels),
  })
}
