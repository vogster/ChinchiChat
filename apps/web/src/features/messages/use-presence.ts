import { useQuery } from '@tanstack/react-query'

import { presencesQueryOptions } from './queries'

import type { PresenceStatus, Snowflake } from '@chinchi/shared'

export const usePresences = () => useQuery(presencesQueryOptions()).data ?? {}

export const usePresence = (userId: Snowflake | undefined): PresenceStatus => {
  const presences = usePresences()
  return (userId && presences[userId]) || 'offline'
}
