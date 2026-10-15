import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useApi } from '../../lib/api-context'
import { removeRelationship, upsertRelationship } from './queries'

import type { Snowflake } from '@chinchi/shared'

/** Friend requests and blocks; the cache follows each answer (the gateway confirms it too). */
export const useRelationshipActions = () => {
  const api = useApi()
  const queryClient = useQueryClient()
  const store = ({ relationship }: Awaited<ReturnType<typeof api.relationships.accept>>) =>
    upsertRelationship(queryClient, relationship)

  return {
    request: useMutation({
      mutationFn: (username: string) => api.relationships.request(username),
      onSuccess: store,
    }),
    accept: useMutation({
      mutationFn: (userId: Snowflake) => api.relationships.accept(userId),
      onSuccess: store,
    }),
    block: useMutation({
      mutationFn: (userId: Snowflake) => api.relationships.block(userId),
      onSuccess: store,
    }),
    /** Unfriend, decline, cancel or unblock. */
    remove: useMutation({
      mutationFn: (userId: Snowflake) => api.relationships.remove(userId),
      onSuccess: (_result, userId) => removeRelationship(queryClient, userId),
    }),
  }
}

export type RelationshipActions = ReturnType<typeof useRelationshipActions>
