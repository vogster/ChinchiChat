import { createFileRoute, redirect } from '@tanstack/react-router'

import { isAdminSection } from '../../features/admin/admin-search'

/** Old links (/admin/guilds) open that section of the administration over the home screen. */
export const Route = createFileRoute('/admin/$section')({
  beforeLoad: ({ params }) => {
    const section = isAdminSection(params.section) ? params.section : 'users'
    throw redirect({ to: '/', search: { admin: section }, replace: true })
  },
})
