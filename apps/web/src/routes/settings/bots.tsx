import { createFileRoute } from '@tanstack/react-router'

import { BotsSection } from '../../features/bots/bots-section'

export const Route = createFileRoute('/settings/bots')({ component: BotsSection })
