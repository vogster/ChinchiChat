import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { useApi } from '../../lib/api-context'
import { removePrivateChannel, upsertPrivateChannel } from './dm-cache'

import type { PrivateChannel, Snowflake } from '@chinchi/shared'

/** One recipient opens (or finds) the 1:1 DM, several start a group; then it is shown. */
export const useOpenDm = () => {
  const api = useApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: (
      recipientIds: readonly Snowflake[] | { ids: readonly Snowflake[]; encrypted: true },
    ) =>
      Array.isArray(recipientIds)
        ? api.dms.open(recipientIds)
        : api.dms.open((recipientIds as { ids: readonly Snowflake[] }).ids, { encrypted: true }),
    onSuccess: async ({ channel }) => {
      upsertPrivateChannel(queryClient, channel)
      await navigate({ to: '/channels/@me/$channelId', params: { channelId: channel.id } })
    },
  })
}

export const useRenameGroup = (channelId: Snowflake) => {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => api.dms.rename(channelId, name.trim() || null),
    onSuccess: ({ channel }) => upsertPrivateChannel(queryClient, channel),
  })
}

/** The gateway announces the new member list; no cache change needed here. */
export const useAddToGroup = (channelId: Snowflake) => {
  const api = useApi()
  return useMutation({
    mutationFn: async (userIds: readonly Snowflake[]) => {
      for (const userId of userIds) await api.dms.addRecipient(channelId, userId)
    },
  })
}

export const useRemoveFromGroup = (channel: PrivateChannel) => {
  const api = useApi()
  return useMutation({
    mutationFn: (userId: Snowflake) => api.dms.removeRecipient(channel.id, userId),
  })
}

/** Leaving drops the group from the list at once and goes home. */
export const useLeaveGroup = (channelId: Snowflake, myId: Snowflake | undefined) => {
  const api = useApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: () => api.dms.removeRecipient(channelId, myId ?? ''),
    onSuccess: async () => {
      removePrivateChannel(queryClient, channelId)
      await navigate({ to: '/' })
    },
  })
}
