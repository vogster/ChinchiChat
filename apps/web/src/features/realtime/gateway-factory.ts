import { createGatewayClient } from '@chinchi/sdk'

import type { DispatchType, SelectableStatus } from '@chinchi/shared'
import type { GatewayState } from '@chinchi/sdk'

export interface GatewayHandlers {
  readonly onDispatch: (type: DispatchType, data: unknown) => void
  readonly onStateChange?: (state: GatewayState) => void
  readonly onAuthFailed?: () => void
}

export interface GatewayConnection {
  connect(): void
  disconnect(): void
  setStatus(status: SelectableStatus): void
}

export type GatewayFactory = (handlers: GatewayHandlers) => GatewayConnection

/** Same-origin gateway; Vite proxies it in development, the reverse proxy in production. */
export const createBrowserGateway: GatewayFactory = (handlers) => {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return createGatewayClient({
    url: `${scheme}://${window.location.host}/api/v1/gateway`,
    ...handlers,
  })
}
