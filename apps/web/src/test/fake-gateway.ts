import { vi } from 'vitest'

import type { GatewayFactory, GatewayHandlers } from '../features/realtime/gateway-factory'
import type { DispatchType } from '@chinchi/shared'

/** Gateway stand-in: tests push dispatches as if they came from the server. */
export const createFakeGateway = () => {
  let handlers: GatewayHandlers | null = null
  const client = {
    connect: vi.fn(() => handlers?.onStateChange?.('ready')),
    disconnect: vi.fn(),
    setStatus: vi.fn(),
  }
  const factory: GatewayFactory = (next) => {
    handlers = next
    return client
  }
  return {
    factory,
    client,
    emit: (type: DispatchType, data: unknown) => handlers?.onDispatch(type, data),
    setState: (state: Parameters<NonNullable<GatewayHandlers['onStateChange']>>[0]) =>
      handlers?.onStateChange?.(state),
    rejectAuth: () => handlers?.onAuthFailed?.(),
  }
}

export type FakeGateway = ReturnType<typeof createFakeGateway>
