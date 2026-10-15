import { createFileRoute } from '@tanstack/react-router'

import { AdminInstanceSection } from '../../features/admin/instance-section'

export const Route = createFileRoute('/admin/instance')({ component: AdminInstanceSection })
