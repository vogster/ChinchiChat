import { describeUserAgent } from '@chinchi/shared'
import { createContext, useCallback, useContext } from 'react'

import { useApi } from '../../lib/api-context'
import { createE2eeClient } from './client'
import { createIndexedDbStore } from './store'

import type { E2eeClient } from './client'
import type { ApiClient } from '@chinchi/sdk'

/** What the app uses of the client; tests put a fake behind it. */
export type E2eeClientLike = Pick<
  E2eeClient,
  | 'ready'
  | 'conversations'
  | 'forget'
  | 'open'
  | 'send'
  | 'edit'
  | 'read'
  | 'devicesChanged'
  | 'callKey'
  | 'safety'
  | 'recovery'
  | 'approvals'
  | 'react'
  | 'readReaction'
  | 'search'
>

export type E2eeClientFactory = (userId: string, api: ApiClient) => E2eeClientLike

const browserClient: E2eeClientFactory = (userId, api) =>
  createE2eeClient({
    api,
    store: createIndexedDbStore(userId),
    userId,
    deviceName: describeUserAgent(navigator.userAgent) ?? 'Browser',
  })

/**
 * How the app makes an encryption client for a user. Kept apart from the provider so the
 * gateway (which sits above it) can reach a user's encryption state without a cycle.
 */
export const E2eeFactoryContext = createContext<E2eeClientFactory>(browserClient)

export const E2eeFactoryProvider = E2eeFactoryContext.Provider

export const useE2eeFactory = () => useContext(E2eeFactoryContext)

/**
 * Wipes this browser's encryption state for a user whose session ended without a sign-out
 * here (signed out elsewhere, revoked): keys, conversations and decrypted messages go, and the
 * device is revoked on the server if the session still allows it.
 */
export const useForgetE2ee = () => {
  const api = useApi()
  const factory = useE2eeFactory()
  return useCallback(
    (userId: string) =>
      factory(userId, api)
        .forget()
        .catch(() => undefined),
    [api, factory],
  )
}
