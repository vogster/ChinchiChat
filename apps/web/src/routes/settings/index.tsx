import { createFileRoute, redirect } from '@tanstack/react-router'

/** The settings open over the chat now; old links land there. */
export const Route = createFileRoute('/settings/')({
  beforeLoad: () => {
    throw redirect({ to: '/', search: { settings: 'account' }, replace: true })
  },
})
