import { queryOptions } from '@tanstack/react-query'

import type { ApiClient } from '@chinchi/sdk'

export const dmKeys = {
  all: ['dms'] as const,
}

/** The user's DMs, most recently active first (READY seeds it, the gateway keeps it). */
export const dmsQueryOptions = (api: ApiClient) =>
  queryOptions({
    queryKey: dmKeys.all,
    queryFn: async () => (await api.dms.list()).channels,
  })
