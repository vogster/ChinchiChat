import { Outlet, createFileRoute } from '@tanstack/react-router'

import { AppShell } from '../../components/layout/app-shell'

/** The chat frame: server rail and current-user panel around the page. */
export const Route = createFileRoute('/_app/_shell')({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
})
