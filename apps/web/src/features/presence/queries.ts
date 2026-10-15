import { queryOptions } from '@tanstack/react-query'

import type { QueryClient } from '@tanstack/react-query'
import type { CustomStatus, Snowflake } from '@chinchi/shared'

/** userId → custom status; filled by the gateway (READY, PRESENCE_UPDATE). */
export type CustomStatuses = Readonly<Record<Snowflake, CustomStatus>>

export const customStatusKeys = { all: ['customStatuses'] as const }

export const customStatusesQueryOptions = () =>
  queryOptions({
    queryKey: customStatusKeys.all,
    queryFn: (): CustomStatuses => ({}),
    staleTime: Infinity,
  })

export const setCustomStatusOf = (
  queryClient: QueryClient,
  userId: Snowflake,
  status: CustomStatus | null,
) =>
  queryClient.setQueryData<CustomStatuses>(customStatusKeys.all, (current = {}) => {
    const { [userId]: _previous, ...rest } = current
    return status ? { ...rest, [userId]: status } : rest
  })
