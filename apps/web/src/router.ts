import { createRouter, parseSearchWith, stringifySearchWith } from '@tanstack/react-router'

import { routeTree } from './routeTree.gen'

import type { RouterContext } from './routes/__root'
import type { RouterHistory } from '@tanstack/react-router'

export interface AppRouterOptions extends RouterContext {
  readonly history?: RouterHistory
}

export const createAppRouter = ({ history, queryClient, api }: AppRouterOptions) =>
  createRouter({
    routeTree,
    context: { queryClient, api },
    ...(history ? { history } : {}),
    defaultPreload: 'intent',
    // Route data comes from React Query; let it decide freshness.
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    // Search params stay strings: the default JSON parsing would turn Snowflake ids into
    // imprecise numbers and quote them in the URL.
    parseSearch: parseSearchWith((value) => value),
    stringifySearch: stringifySearchWith(String),
  })

export type AppRouter = ReturnType<typeof createAppRouter>

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter
  }
}
