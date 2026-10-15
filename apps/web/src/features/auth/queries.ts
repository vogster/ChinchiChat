import { isApiError } from '@chinchi/sdk'
import { queryOptions } from '@tanstack/react-query'

import type { ApiClient } from '@chinchi/sdk'
import type { CurrentUser } from '@chinchi/shared'

export const authKeys = {
  me: ['me'] as const,
  instance: ['instance'] as const,
  sessions: ['sessions'] as const,
}

/** The signed-in user, or `null` for guests (401 is an answer here, not an error). */
export const meQueryOptions = (api: ApiClient) =>
  queryOptions({
    queryKey: authKeys.me,
    queryFn: async (): Promise<CurrentUser | null> => {
      try {
        return (await api.users.me()).user
      } catch (error) {
        if (isApiError(error) && error.status === 401) return null
        throw error
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  })

export const instanceQueryOptions = (api: ApiClient) =>
  queryOptions({
    queryKey: authKeys.instance,
    queryFn: async () => (await api.instance.get()).instance,
    staleTime: 10 * 60_000,
  })

export const sessionsQueryOptions = (api: ApiClient) =>
  queryOptions({
    queryKey: authKeys.sessions,
    queryFn: async () => (await api.sessions.list()).sessions,
  })
