import type { QueryClient } from '@tanstack/react-query'

/** Encrypted conversations deleted for everyone while this page was open. */
const deletedKey = ['deleted-dms'] as const

export const markDeleted = (queryClient: QueryClient, channelId: string) =>
  queryClient.setQueryData<string[]>(deletedKey, (ids = []) => [...ids, channelId])

/** Whether this conversation was deleted (to say so, rather than "not found"). */
export const wasDeleted = (queryClient: QueryClient, channelId: string) =>
  (queryClient.getQueryData<string[]>(deletedKey) ?? []).includes(channelId)
