import { createFileRoute, redirect } from '@tanstack/react-router'

/** Old links (/admin) open the administration over the home screen. */
export const Route = createFileRoute('/admin/')({
  beforeLoad: () => {
    throw redirect({ to: '/', search: { admin: 'users' }, replace: true })
  },
})
