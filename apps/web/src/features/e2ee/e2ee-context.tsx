import { useQuery } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { useApi } from '../../lib/api-context'
import { meQueryOptions } from '../auth/queries'
import { useGateway } from '../realtime/gateway-context'
import { useE2eeFactory } from './e2ee-factory'

import type { E2eeClientLike } from './e2ee-factory'
import type { DeviceApproval } from '@chinchi/shared'
import type { ReactNode } from 'react'

export type { E2eeClientFactory, E2eeClientLike } from './e2ee-factory'
export { E2eeFactoryProvider } from './e2ee-factory'

/** The signed-in user from the cache (the auth actions module imports this one, not the reverse). */
const useMe = () => useQuery(meQueryOptions(useApi())).data ?? null

interface E2eeContextValue {
  readonly client: E2eeClientLike | null
  /** Grows with every handshake or device change: conversations open again to catch up. */
  readonly revision: number
  /** Opens conversations again, e.g. after letting a device in, so they take it in. */
  readonly refresh: () => void
}

const E2eeContext = createContext<E2eeContextValue>({
  client: null,
  revision: 0,
  refresh: () => undefined,
})

/** One encryption client per signed-in user, kept in step with the gateway. */
export const E2eeProvider = ({ children }: { children: ReactNode }) => {
  const api = useApi()
  const me = useMe()
  const factory = useE2eeFactory()
  const gateway = useGateway()
  const userId = me?.id
  const client = useMemo(() => (userId ? factory(userId, api) : null), [userId, api, factory])
  const [revision, setRevision] = useState(0)

  // Every signed-in browser is a device from the start, so conversations started by others
  // include it (a device added later can't read what came before).
  useEffect(() => {
    void client?.ready().catch(() => undefined)
  }, [client])

  useEffect(
    () =>
      gateway.subscribe((type, data) => {
        if (type === 'E2EE_DEVICES_UPDATE') {
          void client?.devicesChanged((data as { userId: string }).userId)
          setRevision((value) => value + 1)
        } else if (type === 'E2EE_HANDSHAKE') {
          setRevision((value) => value + 1)
        } else if (type === 'E2EE_APPROVAL_UPDATE') {
          void client?.approvals.handle(data as DeviceApproval).catch(() => undefined)
        }
      }),
    [gateway, client],
  )

  const refresh = useCallback(() => setRevision((value) => value + 1), [])
  const value = useMemo(() => ({ client, revision, refresh }), [client, revision, refresh])
  return <E2eeContext.Provider value={value}>{children}</E2eeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- hook belongs with its provider
export const useE2ee = () => useContext(E2eeContext)

/**
 * The encryption client also where there is no gateway (settings): the shared one when there
 * is one, otherwise a client over the same browser storage.
 */
// eslint-disable-next-line react-refresh/only-export-components -- hook belongs with its provider
export const useAnyE2eeClient = (): E2eeClientLike | null => {
  const api = useApi()
  const userId = useMe()?.id
  const factory = useE2eeFactory()
  const { client } = useContext(E2eeContext)
  return useMemo(
    () => client ?? (userId ? factory(userId, api) : null),
    [client, userId, factory, api],
  )
}

/** This browser's encryption device id. */
// eslint-disable-next-line react-refresh/only-export-components -- hook belongs with its provider
export const useThisDeviceId = (): string | null => {
  const client = useAnyE2eeClient()
  const userId = useMe()?.id
  const { data = null } = useQuery({
    queryKey: ['e2eeDevices', 'this', userId],
    queryFn: () => (client as E2eeClientLike).ready(),
    enabled: client !== null,
    staleTime: Infinity,
  })
  return data
}
