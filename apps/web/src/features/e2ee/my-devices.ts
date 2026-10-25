import { queryOptions } from '@tanstack/react-query'

import type { ApiClient } from '@chinchi/sdk'

/** The devices holding my encryption keys (settings lists them, the waiting notice counts them). */
export const myDevicesKey = ['e2eeDevices'] as const

export const myDevicesQueryOptions = (api: ApiClient) =>
  queryOptions({
    queryKey: myDevicesKey,
    queryFn: async () => (await api.e2ee.myDevices()).devices,
  })
