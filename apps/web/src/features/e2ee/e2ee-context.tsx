import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'

import { useApi } from '../../lib/api-context'
import { useCurrentUser } from '../auth/use-auth-actions'
import { useGateway } from '../realtime/gateway-context'
import { describeUserAgent } from '../settings/user-agent'
import { createE2eeClient } from './client'
import { createIndexedDbStore } from './store'

import type { E2eeClient } from './client'
import type { ApiClient } from '@chinchi/sdk'
import type { ReactNode } from 'react'

/** What the app uses of the client; tests put a fake behind it. */
export type E2eeClientLike = Pick<
  E2eeClient,
  'ready' | 'open' | 'send' | 'edit' | 'read' | 'devicesChanged' | 'callKey' | 'safety'
>

export type E2eeClientFactory = (userId: string, api: ApiClient) => E2eeClientLike

const browserClient: E2eeClientFactory = (userId, api) =>
  createE2eeClient({
    api,
    store: createIndexedDbStore(userId),
    userId,
    deviceName: describeUserAgent(navigator.userAgent) ?? 'Browser',
  })

const FactoryContext = createContext<E2eeClientFactory>(browserClient)

export const E2eeFactoryProvider = FactoryContext.Provider

interface E2eeContextValue {
  readonly client: E2eeClientLike | null
  /** Grows with every handshake or device change: conversations open again to catch up. */
  readonly revision: number
}

const E2eeContext = createContext<E2eeContextValue>({ client: null, revision: 0 })

/** One encryption client per signed-in user, kept in step with the gateway. */
export const E2eeProvider = ({ children }: { children: ReactNode }) => {
  const api = useApi()
  const me = useCurrentUser()
  const factory = useContext(FactoryContext)
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
        }
      }),
    [gateway, client],
  )

  const value = useMemo(() => ({ client, revision }), [client, revision])
  return <E2eeContext.Provider value={value}>{children}</E2eeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- hook belongs with its provider
export const useE2ee = () => useContext(E2eeContext)

/**
 * This browser's encryption device, also where there is no gateway (settings): the shared client
 * when there is one, otherwise a client over the same browser storage.
 */
// eslint-disable-next-line react-refresh/only-export-components -- hook belongs with its provider
export const useThisDeviceId = (): string | null => {
  const api = useApi()
  const userId = useCurrentUser()?.id
  const factory = useContext(FactoryContext)
  const { client } = useContext(E2eeContext)
  const { data = null } = useQuery({
    queryKey: ['e2eeDevices', 'this', userId],
    queryFn: () => (client ?? factory(userId as string, api)).ready(),
    enabled: userId !== undefined,
    staleTime: Infinity,
  })
  return data
}
