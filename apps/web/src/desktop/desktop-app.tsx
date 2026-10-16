import { QueryClient } from '@tanstack/react-query'
import { createHashHistory } from '@tanstack/react-router'
import { useState } from 'react'

import { App } from '../app'
import { createAppRouter } from '../router'
import { createDesktopApi, createDesktopGateway } from './api'
import { InstancePicker } from './instance-picker'

import type { DesktopSettings, DesktopSettingsStore } from './settings'
import type { FetchLike } from '@chinchi/sdk'

/** The app for one instance: API in bearer mode, the gateway with the stored token. */
const connect = (
  instanceUrl: string,
  settings: DesktopSettingsStore,
  fetch: FetchLike,
  initialToken: string | null,
) => {
  let token = initialToken
  const api = createDesktopApi({
    instanceUrl,
    fetch,
    token: {
      get: () => token,
      set: async (next) => {
        token = next
        await settings.setToken(next)
      },
    },
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
  })
  // Hash routes: the shell serves one HTML file, and a reload must land on it, not on /channels.
  const router = createAppRouter({ queryClient, api, history: createHashHistory() })
  const gateway = createDesktopGateway(instanceUrl, () => token)
  return { api, queryClient, router, gateway }
}

export interface DesktopAppProps {
  readonly settings: DesktopSettingsStore
  readonly initial: DesktopSettings
  /** Tauri's HTTP plugin in the shell; a fake in tests. */
  readonly fetch: FetchLike
}

/** Picks an instance on the first launch, then runs the web app against it. */
export const DesktopApp = ({ settings, initial, fetch }: DesktopAppProps) => {
  const [connection, setConnection] = useState(() =>
    initial.instanceUrl ? connect(initial.instanceUrl, settings, fetch, initial.token) : null,
  )

  if (!connection) {
    return (
      <InstancePicker
        fetch={fetch}
        initialUrl={initial.instanceUrl}
        onChosen={(chosen, name) => {
          void settings.setInstanceUrl(chosen).then(() => {
            document.title = `Chinchi — ${name}`
            setConnection(connect(chosen, settings, fetch, null))
          })
        }}
      />
    )
  }
  return (
    <App
      router={connection.router}
      queryClient={connection.queryClient}
      api={connection.api}
      gateway={connection.gateway}
    />
  )
}
