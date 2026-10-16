import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'

import { NotFound } from '../components/not-found'

import type { ApiClient } from '@chinchi/sdk'
import type { QueryClient } from '@tanstack/react-query'

export interface RouterContext {
  readonly queryClient: QueryClient
  readonly api: ApiClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: NotFound,
})
