import { authKeys } from '../auth/queries'
import { guildKeys } from './queries'

import type { Channel, CurrentUser, GuildDetail, Member, Role } from '@chinchi/shared'
import type { QueryClient } from '@tanstack/react-query'

/** Cache updates shared by gateway dispatches and the client's own mutations. */

export const updateGuild = (
  queryClient: QueryClient,
  guildId: string,
  change: (guild: GuildDetail) => GuildDetail,
) =>
  queryClient.setQueryData<GuildDetail>(guildKeys.detail(guildId), (guild) =>
    guild ? change(guild) : guild,
  )

export const updateChannels = (
  queryClient: QueryClient,
  guildId: string,
  change: (channels: readonly Channel[]) => Channel[],
) => updateGuild(queryClient, guildId, (guild) => ({ ...guild, channels: change(guild.channels) }))

export const upsertChannel = (queryClient: QueryClient, channel: Channel) =>
  updateChannels(queryClient, channel.guildId, (channels) =>
    channels.some((c) => c.id === channel.id)
      ? channels.map((c) => (c.id === channel.id ? channel : c))
      : [...channels, channel],
  )

/**
 * A thread's message count, kept current from the thread's own MESSAGE_CREATE / DELETE
 * events (the server doesn't announce every change). No-op for other channels.
 */
export const bumpThreadCount = (
  queryClient: QueryClient,
  guildId: string | null,
  channelId: string,
  delta: number,
) => {
  if (!guildId) return
  updateGuild(queryClient, guildId, (guild) =>
    guild.channels.some((c) => c.id === channelId && c.type === 'thread')
      ? {
          ...guild,
          channels: guild.channels.map((c) =>
            c.id === channelId ? { ...c, messageCount: Math.max(0, c.messageCount + delta) } : c,
          ),
        }
      : guild,
  )
}

export const upsertRoles = (queryClient: QueryClient, guildId: string, roles: readonly Role[]) =>
  updateGuild(queryClient, guildId, (guild) => {
    const changed = new Map(roles.map((role) => [role.id, role]))
    const kept = guild.roles.map((role) => changed.get(role.id) ?? role)
    const added = roles.filter((role) => !guild.roles.some((r) => r.id === role.id))
    return { ...guild, roles: [...kept, ...added] }
  })

export const removeRole = (queryClient: QueryClient, guildId: string, roleId: string) => {
  updateGuild(queryClient, guildId, (guild) => ({
    ...guild,
    roles: guild.roles.filter((r) => r.id !== roleId),
    myRoleIds: guild.myRoleIds.filter((id) => id !== roleId),
  }))
  queryClient.setQueryData<Member[]>(guildKeys.members(guildId), (members) =>
    members?.map((m) => ({ ...m, roleIds: m.roleIds.filter((id) => id !== roleId) })),
  )
}

/** A member's timeout (null: none), also the viewer's own in the server detail. */
export const setMemberTimeout = (
  queryClient: QueryClient,
  guildId: string,
  userId: string,
  timeoutUntil: string | null,
) => {
  queryClient.setQueryData<Member[]>(guildKeys.members(guildId), (members) =>
    members?.map((m) => (m.user.id === userId ? { ...m, timeoutUntil } : m)),
  )
  const me = queryClient.getQueryData<CurrentUser | null>(authKeys.me)
  if (me?.id === userId) {
    updateGuild(queryClient, guildId, (guild) => ({ ...guild, myTimeoutUntil: timeoutUntil }))
  }
}

/** A member's server nickname (null: their own name). */
export const setMemberNickname = (
  queryClient: QueryClient,
  guildId: string,
  userId: string,
  nickname: string | null,
) =>
  queryClient.setQueryData<Member[]>(guildKeys.members(guildId), (members) =>
    members?.map((m) => (m.user.id === userId ? { ...m, nickname } : m)),
  )

export const setMemberRoles = (
  queryClient: QueryClient,
  guildId: string,
  userId: string,
  change: (roleIds: readonly string[]) => string[],
) => {
  queryClient.setQueryData<Member[]>(guildKeys.members(guildId), (members) =>
    members?.map((m) => (m.user.id === userId ? { ...m, roleIds: change(m.roleIds) } : m)),
  )
  const me = queryClient.getQueryData<CurrentUser | null>(authKeys.me)
  if (me?.id === userId)
    updateGuild(queryClient, guildId, (guild) => ({ ...guild, myRoleIds: change(guild.myRoleIds) }))
}
