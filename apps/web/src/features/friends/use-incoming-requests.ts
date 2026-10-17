import { useQuery } from '@tanstack/react-query'

import { useApi } from '../../lib/api-context'
import { relationshipsQueryOptions } from './queries'

/** Friend requests waiting for my answer (the ones I sent are not counted). */
export const useIncomingRequests = (): number => {
  const { data: relationships = [] } = useQuery(relationshipsQueryOptions(useApi()))
  return relationships.filter((relationship) => relationship.type === 'pending_in').length
}
