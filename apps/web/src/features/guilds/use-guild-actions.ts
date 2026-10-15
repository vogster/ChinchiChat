import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { useApi } from '../../lib/api-context'
import { firstTextChannel } from './channel-tree'
import { guildKeys } from './queries'

import type {
  CreateChannelRequest,
  GuildDetail,
  Snowflake,
  UpdateChannelRequest,
} from '@chinchi/shared'

/** Opens a server at its first text channel (or the server root if it has none). */
const useOpenGuild = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  return async (guild: GuildDetail) => {
    queryClient.setQueryData(guildKeys.detail(guild.id), guild)
    await queryClient.invalidateQueries({ queryKey: guildKeys.all, exact: true })
    const channel = firstTextChannel(guild.channels)
    await (channel
      ? navigate({
          to: '/channels/$guildId/$channelId',
          params: { guildId: guild.id, channelId: channel.id },
        })
      : navigate({ to: '/channels/$guildId', params: { guildId: guild.id } }))
  }
}

export const useCreateGuild = () => {
  const api = useApi()
  const openGuild = useOpenGuild()
  return useMutation({
    mutationFn: (body: { name: string; locale: 'ru' | 'en' }) => api.guilds.create(body),
    onSuccess: ({ guild }) => openGuild(guild),
  })
}

export const useAcceptInvite = () => {
  const api = useApi()
  const openGuild = useOpenGuild()
  return useMutation({
    mutationFn: (code: string) => api.invites.accept(code),
    onSuccess: ({ guild }) => openGuild(guild),
  })
}

/** Leaves the server view after it disappears for this user (left or deleted). */
const useExitGuild = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  return async (guildId: Snowflake) => {
    await navigate({ to: '/' })
    queryClient.removeQueries({ queryKey: guildKeys.detail(guildId) })
    await queryClient.invalidateQueries({ queryKey: guildKeys.all, exact: true })
  }
}

export const useLeaveGuild = (guildId: Snowflake) => {
  const api = useApi()
  const exit = useExitGuild()
  return useMutation({
    mutationFn: () => api.guilds.leave(guildId),
    onSuccess: () => exit(guildId),
  })
}

export const useDeleteGuild = (guildId: Snowflake) => {
  const api = useApi()
  const exit = useExitGuild()
  return useMutation({
    mutationFn: () => api.guilds.delete(guildId),
    onSuccess: () => exit(guildId),
  })
}

/** Refreshes the server (and the rail) after any change to it. */
const useRefreshGuild = (guildId: Snowflake) => {
  const queryClient = useQueryClient()
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: guildKeys.detail(guildId) }),
      queryClient.invalidateQueries({ queryKey: guildKeys.all, exact: true }),
    ])
  }
}

export const useRenameGuild = (guildId: Snowflake) => {
  const api = useApi()
  const refresh = useRefreshGuild(guildId)
  return useMutation({
    mutationFn: (name: string) => api.guilds.update(guildId, { name }),
    onSuccess: refresh,
  })
}

/** Server rules; blank turns them off. */
export const useGuildRules = (guildId: Snowflake) => {
  const api = useApi()
  const refresh = useRefreshGuild(guildId)
  return useMutation({
    mutationFn: (rules: string) => api.guilds.update(guildId, { rules: rules.trim() || null }),
    onSuccess: refresh,
  })
}

/** Sets (a file) or removes (null) the server icon. */
export const useGuildIcon = (guildId: Snowflake) => {
  const api = useApi()
  const refresh = useRefreshGuild(guildId)
  return useMutation({
    mutationFn: (file: File | null) =>
      file ? api.guilds.setIcon(guildId, file) : api.guilds.clearIcon(guildId),
    onSuccess: refresh,
  })
}

export const useTransferGuild = (guildId: Snowflake) => {
  const api = useApi()
  const refresh = useRefreshGuild(guildId)
  return useMutation({
    mutationFn: (userId: Snowflake) => api.guilds.transfer(guildId, userId),
    onSuccess: refresh,
  })
}

export const useCreateChannel = (guildId: Snowflake) => {
  const api = useApi()
  const refresh = useRefreshGuild(guildId)
  const navigate = useNavigate()
  return useMutation({
    mutationFn: (body: CreateChannelRequest) => api.channels.create(guildId, body),
    onSuccess: async ({ channel }) => {
      await refresh()
      if (channel.type === 'text') {
        await navigate({
          to: '/channels/$guildId/$channelId',
          params: { guildId, channelId: channel.id },
        })
      }
    },
  })
}

export const useUpdateChannel = (guildId: Snowflake) => {
  const api = useApi()
  const refresh = useRefreshGuild(guildId)
  return useMutation({
    mutationFn: ({ channelId, body }: { channelId: Snowflake; body: UpdateChannelRequest }) =>
      api.channels.update(channelId, body),
    onSuccess: refresh,
  })
}

export const useDeleteChannel = (guildId: Snowflake) => {
  const api = useApi()
  const refresh = useRefreshGuild(guildId)
  const navigate = useNavigate()
  return useMutation({
    mutationFn: (channelId: Snowflake) => api.channels.delete(channelId),
    onSuccess: async () => {
      await refresh()
      await navigate({ to: '/channels/$guildId', params: { guildId } })
    },
  })
}
