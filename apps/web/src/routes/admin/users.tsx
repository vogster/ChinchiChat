import { createFileRoute } from '@tanstack/react-router'

import { AdminUsersSection } from '../../features/admin/users-section'

export const Route = createFileRoute('/admin/users')({ component: AdminUsersSection })
