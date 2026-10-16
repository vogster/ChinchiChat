import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'

import { authKeys } from '../auth/queries'
import { useForgetE2ee } from '../e2ee/e2ee-factory'
import { useDesktopNotifier } from '../notifications/use-desktop-notifier'
import { applyDispatch } from './apply-dispatch'
import { createBrowserGateway } from './gateway-factory'
import { createTypingStore } from './typing-store'

import type { GatewayConnection, GatewayFactory } from './gateway-factory'
import type { TypingStore } from './typing-store'
import type { CurrentUser, DispatchType, SelectableStatus } from '@chinchi/shared'
import type { GatewayState } from '@chinchi/sdk'
import type { ReactNode } from 'react'

export type DispatchListener = (type: DispatchType, data: unknown) => void

interface GatewayContextValue {
  readonly state: GatewayState
  readonly typing: TypingStore
  readonly setStatus: (status: SelectableStatus) => void
  /** Hears every event after the cache has it; returns the unsubscribe. */
  readonly subscribe: (listener: DispatchListener) => () => void
}

const GatewayFactoryContext = createContext<GatewayFactory>(createBrowserGateway)
const GatewayContext = createContext<GatewayContextValue | null>(null)

export const GatewayFactoryProvider = GatewayFactoryContext.Provider

/** Keeps one realtime connection open while a user is signed in, feeding the query cache. */
export const GatewayProvider = ({ children }: { children: ReactNode }) => {
  const factory = useContext(GatewayFactoryContext)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [state, setState] = useState<GatewayState>('idle')
  const [typing] = useState(createTypingStore)
  const connection = useRef<GatewayConnection | null>(null)
  const [listeners] = useState(() => new Set<DispatchListener>())
  // The latest notifier, without reconnecting when it changes.
  const notify = useDesktopNotifier()
  const notifyRef = useRef(notify)
  const forgetE2ee = useForgetE2ee()
  const forgetRef = useRef(forgetE2ee)
  useEffect(() => {
    notifyRef.current = notify
    forgetRef.current = forgetE2ee
  })

  useEffect(() => {
    const client = factory({
      onDispatch: (type, data) => {
        applyDispatch(queryClient, typing, type, data)
        notifyRef.current(type, data)
        for (const listener of listeners) listener(type, data)
      },
      onStateChange: setState,
      onAuthFailed: () => {
        // Logged out elsewhere or the session was revoked: this browser keeps no keys or
        // decrypted messages of the account that just left it.
        const me = queryClient.getQueryData<CurrentUser | null>(authKeys.me)
        if (me) void forgetRef.current(me.id)
        queryClient.clear()
        queryClient.setQueryData(authKeys.me, null)
        void navigate({ to: '/login' })
      },
    })
    connection.current = client
    client.connect()
    return () => {
      client.disconnect()
      connection.current = null
    }
  }, [factory, queryClient, typing, navigate, listeners])

  const value = useMemo(
    () => ({
      state,
      typing,
      setStatus: (status: SelectableStatus) => connection.current?.setStatus(status),
      subscribe: (listener: DispatchListener) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    }),
    [state, typing, listeners],
  )
  return <GatewayContext.Provider value={value}>{children}</GatewayContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- hook belongs with its provider
export const useGateway = (): GatewayContextValue => {
  const value = useContext(GatewayContext)
  if (!value) throw new Error('useGateway must be used inside <GatewayProvider>')
  return value
}
