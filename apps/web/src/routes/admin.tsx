import { createFileRoute, Outlet } from '@tanstack/react-router'

import { AdminLayout } from '../features/admin/admin-layout'
import { requireUser } from '../features/auth/require-user'

export const Route = createFileRoute('/admin')({
  beforeLoad: ({ context, location }) => requireUser(context, location.href),
  component: () => (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  ),
})
