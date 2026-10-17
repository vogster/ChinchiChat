import { createFileRoute, redirect } from '@tanstack/react-router'

import { isSettingsSection } from '../../features/settings/settings-search'

/** Old links (/settings/profile) open that section over the home screen. */
export const Route = createFileRoute('/settings/$section')({
  beforeLoad: ({ params }) => {
    const section = isSettingsSection(params.section) ? params.section : 'account'
    throw redirect({ to: '/', search: { settings: section }, replace: true })
  },
})
