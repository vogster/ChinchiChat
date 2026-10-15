import { queryOptions } from '@tanstack/react-query'

import type { ApiClient } from '@chinchi/sdk'
import type { Snowflake } from '@chinchi/shared'

export const guildKeys = {
  all: ['guilds'] as const,
  detail: (guildId: Snowflake) => ['guilds', guildId] as const,
  members: (guildId: Snowflake) => ['guilds', guildId, 'members'] as const,
  invite: (code: string) => ['invites', code] as const,
}

export const guildsQueryOptions = (api: ApiClient) =>
  queryOptions({
    queryKey: guildKeys.all,
    queryFn: async () => (await api.guilds.list()).guilds,
  })

export const guildQueryOptions = (api: ApiClient, guildId: Snowflake) =>
  queryOptions({
    queryKey: guildKeys.detail(guildId),
    queryFn: async () => (await api.guilds.get(guildId)).guild,
    retry: false,
  })

export const membersQueryOptions = (api: ApiClient, guildId: Snowflake) =>
  queryOptions({
    queryKey: guildKeys.members(guildId),
    queryFn: async () => (await api.guilds.members(guildId)).members,
  })

export const inviteQueryOptions = (api: ApiClient, code: string) =>
  queryOptions({
    queryKey: guildKeys.invite(code),
    queryFn: async () => (await api.invites.get(code)).invite,
    retry: false,
  })
