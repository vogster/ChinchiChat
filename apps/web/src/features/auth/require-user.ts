import { redirect } from '@tanstack/react-router'

import { meQueryOptions } from './queries'

import type { RouterContext } from '../../routes/__root'

/** Route guard: guests are sent to /login and come back here after signing in. */
export const requireUser = async (context: RouterContext, href: string) => {
  const user = await context.queryClient.ensureQueryData(meQueryOptions(context.api))
  if (!user) throw redirect({ to: '/login', search: { redirect: href } })
  return user
}
