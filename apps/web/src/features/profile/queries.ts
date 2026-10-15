import { queryOptions } from '@tanstack/react-query'

import type { ApiClient } from '@chinchi/sdk'
import type { Snowflake } from '@chinchi/shared'

export const profileKeys = {
  /** Every cached view of someone's profile (all servers it was opened from). */
  user: (userId: Snowflake) => ['profiles', userId] as const,
  view: (userId: Snowflake, guildId: Snowflake | null) => ['profiles', userId, guildId] as const,
}

/** Someone's profile, seen from a server (roles, nickname) or from anywhere else. */
export const profileQueryOptions = (api: ApiClient, userId: Snowflake, guildId: Snowflake | null) =>
  queryOptions({
    queryKey: profileKeys.view(userId, guildId),
    queryFn: async () => (await api.users.profile(userId, guildId ?? undefined)).profile,
    staleTime: 30_000,
    retry: false,
  })
