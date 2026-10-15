import { createFileRoute } from '@tanstack/react-router'

import { AdminGuildsSection } from '../../features/admin/guilds-section'

export const Route = createFileRoute('/admin/guilds')({ component: AdminGuildsSection })
