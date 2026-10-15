import { queryOptions } from '@tanstack/react-query'

import type { QueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@chinchi/sdk'
import type { Relationship } from '@chinchi/shared'

export const relationshipKeys = {
  all: ['relationships'] as const,
}

export const relationshipsQueryOptions = (api: ApiClient) =>
  queryOptions({
    queryKey: relationshipKeys.all,
    queryFn: async () => (await api.relationships.list()).relationships,
  })

/** One relationship per person: a new one replaces what was there. */
export const upsertRelationship = (queryClient: QueryClient, relationship: Relationship) =>
  queryClient.setQueryData<Relationship[]>(relationshipKeys.all, (list) =>
    list ? [...list.filter((r) => r.user.id !== relationship.user.id), relationship] : list,
  )

export const removeRelationship = (queryClient: QueryClient, userId: string) =>
  queryClient.setQueryData<Relationship[]>(relationshipKeys.all, (list) =>
    list ? list.filter((r) => r.user.id !== userId) : list,
  )
