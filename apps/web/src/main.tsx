import '@fontsource-variable/rubik/index.css'
import './styles.css'

import { QueryClient } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app'
import { createBrowserApi } from './lib/api'
import { initI18n } from './lib/i18n'
import { registerServiceWorker } from './lib/service-worker'
import { applyStoredTheme } from './lib/theme'
import { createAppRouter } from './router'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root not found in index.html')
}

applyStoredTheme()
initI18n()
registerServiceWorker()

const api = createBrowserApi()
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
})
const router = createAppRouter({ queryClient, api })

createRoot(rootElement).render(
  <StrictMode>
    <App router={router} queryClient={queryClient} api={api} />
  </StrictMode>,
)
