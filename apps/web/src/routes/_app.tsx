import { Outlet, createFileRoute } from '@tanstack/react-router'

import { requireUser } from '../features/auth/require-user'
import { E2eeProvider } from '../features/e2ee/e2ee-context'
import { UnreadBadge } from '../features/notifications/unread-badge'
import { GatewayProvider } from '../features/realtime/gateway-context'
import { VoiceProvider } from '../features/voice/voice-context'

/**
 * Everything under this layout requires a signed-in user and shares one gateway connection, so
 * moving between the chat and server settings does not reconnect (nor drop a voice call).
 */
export const Route = createFileRoute('/_app')({
  beforeLoad: ({ context, location }) => requireUser(context, location.href),
  component: () => (
    <GatewayProvider>
      <E2eeProvider>
        <UnreadBadge />
        <VoiceProvider>
          <Outlet />
        </VoiceProvider>
      </E2eeProvider>
    </GatewayProvider>
  ),
})
