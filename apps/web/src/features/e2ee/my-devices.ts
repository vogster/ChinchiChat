import { queryOptions, useQuery } from '@tanstack/react-query'

import { useApi } from '../../lib/api-context'
import { useThisDeviceId } from './e2ee-context'

import type { ApiClient } from '@chinchi/sdk'

/** The devices holding my encryption keys (settings lists them; the notices count them). */
export const myDevicesKey = ['e2eeDevices'] as const

export const myDevicesQueryOptions = (api: ApiClient) =>
  queryOptions({
    queryKey: myDevicesKey,
    queryFn: async () => (await api.e2ee.myDevices()).devices,
  })

/**
 * Whether I have another device that could let this one in or approve it: false when every
 * other one is gone (signed out, keys deleted), null while the list loads.
 */
export const useHasOtherDevices = (): boolean | null => {
  const { data } = useQuery(myDevicesQueryOptions(useApi()))
  const thisDevice = useThisDeviceId()
  if (!data || !thisDevice) return null
  return data.some((device) => device.id !== thisDevice && device.revokedAt === null)
}
