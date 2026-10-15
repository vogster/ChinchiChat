import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useApi } from '../../lib/api-context'
import { applyChannelOrder, planChannelMove } from './channel-order'
import { updateChannels } from './guild-cache'
import { guildKeys } from './queries'

import type { ChannelDrop } from './channel-order'
import type { Channel, GuildDetail, ReorderChannelsRequest } from '@chinchi/shared'

/** Moves a channel in the sidebar: shown at once, put back if the server refuses. */
export const useChannelReorder = (guildId: string) => {
  const api = useApi()
  const queryClient = useQueryClient()

  const reorder = useMutation({
    mutationFn: (items: ReorderChannelsRequest) => api.channels.reorder(guildId, items),
    onMutate: (items) => {
      const before = queryClient.getQueryData<GuildDetail>(guildKeys.detail(guildId))?.channels
      updateChannels(queryClient, guildId, (channels) => applyChannelOrder(channels, items))
      return { before }
    },
    onError: (_error, _items, context) => {
      const before = context?.before
      if (before) updateChannels(queryClient, guildId, () => [...before])
    },
    onSuccess: ({ channels }) => {
      // The answer omits threads and channels hidden from the user; keep those from the cache.
      const byId = new Map(channels.map((channel) => [channel.id, channel]))
      updateChannels(queryClient, guildId, (current) =>
        current.map((channel) => byId.get(channel.id) ?? channel),
      )
    },
  })

  return (channels: readonly Channel[], channelId: string, drop: ChannelDrop) => {
    const items = planChannelMove(channels, channelId, drop)
    if (items.length > 0) reorder.mutate(items)
  }
}
