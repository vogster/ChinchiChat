import { Outlet, createFileRoute } from '@tanstack/react-router'

import { requireUser } from '../features/auth/require-user'
import { SettingsLayout } from '../features/settings/settings-layout'

export const Route = createFileRoute('/settings')({
  beforeLoad: ({ context, location }) => requireUser(context, location.href),
  component: () => (
    <SettingsLayout>
      <Outlet />
    </SettingsLayout>
  ),
})
