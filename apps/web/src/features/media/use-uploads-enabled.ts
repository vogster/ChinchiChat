import { useQuery } from '@tanstack/react-query'

import { useApi } from '../../lib/api-context'
import { instanceQueryOptions } from '../auth/queries'

/** Whether the instance has file storage; false until known, so controls never flash. */
export const useUploadsEnabled = (): boolean => {
  const { data } = useQuery(instanceQueryOptions(useApi()))
  return Boolean(data?.uploads)
}
