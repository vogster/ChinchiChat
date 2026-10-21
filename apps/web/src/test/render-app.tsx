import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory } from '@tanstack/react-router'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { App } from '../app'
import { ENCRYPTION_GUIDE_SEEN } from '../features/e2ee/use-encryption-guide'
import { setDeviceFlag } from '../lib/device-flag'
import { initI18n } from '../lib/i18n'
import { createAppRouter } from '../router'
import { createFakeApi } from './fake-api'
import { createFakeE2ee } from './fake-e2ee'
import { createFakeGateway } from './fake-gateway'
import { createFakeVoice } from './fake-voice'

import type { ConversationStatus } from '../features/e2ee/client'
import type { Shell } from '../features/shell/shell-context'
import type { FakeApi, FakeApiOptions } from './fake-api'

export interface RenderAppOptions extends FakeApiOptions {
  readonly api?: FakeApi
  /** What the fake encryption client says when a conversation is opened. */
  readonly e2eeStatus?: ConversationStatus
  /** A desktop shell around the app (see createFakeShell); none by default, like a browser. */
  readonly shell?: Shell
  /** The instance the page is not on (the desktop); none by default, like a browser. */
  readonly mediaBase?: string
  /** Show the encryption guide as on a first visit (other tests find it already seen). */
  readonly encryptionGuide?: boolean
}

/** Renders the whole app (router, guards, providers) at `path` against a fake API. */
export const renderApp = (
  path = '/',
  {
    api: givenApi,
    e2eeStatus,
    shell,
    mediaBase,
    encryptionGuide = false,
    ...apiOptions
  }: RenderAppOptions = {},
) => {
  initI18n('ru')
  setDeviceFlag(ENCRYPTION_GUIDE_SEEN, !encryptionGuide)
  const api = givenApi ?? createFakeApi(apiOptions)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const router = createAppRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    queryClient,
    api,
  })

  const gateway = createFakeGateway()
  const voice = createFakeVoice()
  const e2ee = createFakeE2ee(e2eeStatus)
  const { unmount } = render(
    <App
      router={router}
      queryClient={queryClient}
      api={api}
      gateway={gateway.factory}
      voice={voice.factory}
      e2ee={e2ee.factory}
      shell={shell ?? null}
      mediaBase={mediaBase ?? null}
    />,
  )
  return {
    api,
    router,
    queryClient,
    gateway,
    voice,
    e2ee: e2ee.client,
    user: userEvent.setup(),
    unmount,
  }
}
