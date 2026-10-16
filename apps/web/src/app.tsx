import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'

import { E2eeFactoryProvider } from './features/e2ee/e2ee-context'
import { GatewayFactoryProvider } from './features/realtime/gateway-context'
import { createBrowserGateway } from './features/realtime/gateway-factory'
import { VoiceRoomFactoryProvider } from './features/voice/voice-context'
import { createLiveKitRoom } from './features/voice/voice-room'
import { ApiProvider } from './lib/api-context'

import type { E2eeClientFactory } from './features/e2ee/e2ee-context'
import type { GatewayFactory } from './features/realtime/gateway-factory'
import type { VoiceRoomFactory } from './features/voice/voice-room'
import type { AppRouter } from './router'
import type { ApiClient } from '@chinchi/sdk'
import type { QueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'

export interface AppProps {
  readonly router: AppRouter
  readonly queryClient: QueryClient
  readonly api: ApiClient
  /** Tests replace the realtime connection with a fake. */
  readonly gateway?: GatewayFactory
  /** Tests replace LiveKit with a fake. */
  readonly voice?: VoiceRoomFactory
  /** Tests replace the MLS client with a fake. */
  readonly e2ee?: E2eeClientFactory
}

/** Keeps the browser's MLS client unless a test brings its own. */
const MaybeE2eeFactory = ({
  factory,
  children,
}: {
  factory: E2eeClientFactory | undefined
  children: ReactNode
}) => (factory ? <E2eeFactoryProvider value={factory}>{children}</E2eeFactoryProvider> : children)

export const App = ({
  router,
  queryClient,
  api,
  gateway = createBrowserGateway,
  voice = createLiveKitRoom,
  e2ee,
}: AppProps) => (
  <ApiProvider api={api}>
    <GatewayFactoryProvider value={gateway}>
      <MaybeE2eeFactory factory={e2ee}>
        <VoiceRoomFactoryProvider value={voice}>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </VoiceRoomFactoryProvider>
      </MaybeE2eeFactory>
    </GatewayFactoryProvider>
  </ApiProvider>
)
