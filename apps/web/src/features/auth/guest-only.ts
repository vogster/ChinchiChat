import { redirect } from '@tanstack/react-router'

import { meQueryOptions } from './queries'
import { safeRedirect } from './redirect'

import type { RouterContext } from '../../routes/__root'

/** For login/register: signed-in users skip straight to where they were going. */
export const redirectIfSignedIn = async (context: RouterContext, target?: string) => {
  const user = await context.queryClient.ensureQueryData(meQueryOptions(context.api))
  if (user) throw redirect({ href: safeRedirect(target) })
}
