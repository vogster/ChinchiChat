import { createFileRoute, Outlet } from '@tanstack/react-router'

import { AdminDialog } from '../features/admin/admin-dialog'
import { adminSearchSchema } from '../features/admin/admin-search'
import { NewSignInNotice } from '../features/auth/new-sign-in-notice'
import { QrApproveDialog } from '../features/auth/qr-approve-dialog'
import { qrLoginSearchSchema } from '../features/auth/qr-login-search'
import { requireUser } from '../features/auth/require-user'
import { ApprovalDialog } from '../features/e2ee/approval-dialog'
import { E2eeProvider } from '../features/e2ee/e2ee-context'
import { UnreadBadge } from '../features/notifications/unread-badge'
import { GatewayProvider } from '../features/realtime/gateway-context'
import { ServerSettingsDialog } from '../features/server-settings/server-settings-dialog'
import { serverSettingsSearchSchema } from '../features/server-settings/server-settings-search'
import { SettingsDialog } from '../features/settings/settings-dialog'
import { settingsSearchSchema } from '../features/settings/settings-search'
import { PushToTalk } from '../features/shell/push-to-talk'
import { VoiceProvider } from '../features/voice/voice-context'

/**
 * Everything under this layout requires a signed-in user and shares one gateway connection, so
 * moving between pages does not reconnect (nor drop a voice call). The user's and a server's
 * settings, the administration and the approval of a QR sign-in open over any of these pages
 * (`?settings=`, `?serverSettings=`, `?admin=`, `?qr=`) for the same reason.
 */
export const Route = createFileRoute('/_app')({
  validateSearch: settingsSearchSchema
    .extend(serverSettingsSearchSchema.shape)
    .extend(adminSearchSchema.shape)
    .extend(qrLoginSearchSchema.shape),
  beforeLoad: ({ context, location }) => requireUser(context, location.href),
  component: () => (
    <GatewayProvider>
      <E2eeProvider>
        <ApprovalDialog />
        <QrApproveDialog />
        <NewSignInNotice />
        <UnreadBadge />
        <VoiceProvider>
          <PushToTalk />
          <Outlet />
          <SettingsDialog />
          <ServerSettingsDialog />
          <AdminDialog />
        </VoiceProvider>
      </E2eeProvider>
    </GatewayProvider>
  ),
})
