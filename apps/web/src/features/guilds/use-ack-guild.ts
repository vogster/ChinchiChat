import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useApi } from '../../lib/api-context'
import { messageKeys } from '../messages/queries'

import type { ReadStates } from '../messages/queries'
import type { GuildDetail, MentionCounts } from '@chinchi/shared'

/** "Mark as read" for a whole server: clears it at once, the server catches up behind. */
export const useAckGuild = () => {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (guild: GuildDetail) => api.guilds.ack(guild.id),
    onMutate: (guild) => {
      const read = guild.channels.flatMap((channel) =>
        (channel.type === 'text' || channel.type === 'thread') && channel.lastMessageId
          ? [[channel.id, channel.lastMessageId] as const]
          : [],
      )
      queryClient.setQueryData<ReadStates>(messageKeys.readStates, (states) => ({
        ...states,
        ...Object.fromEntries(read),
      }))
      const ids = new Set(guild.channels.map((channel) => channel.id))
      queryClient.setQueryData<MentionCounts>(messageKeys.mentionCounts, (counts = {}) =>
        Object.fromEntries(Object.entries(counts).filter(([id]) => !ids.has(id))),
      )
    },
  })
}
