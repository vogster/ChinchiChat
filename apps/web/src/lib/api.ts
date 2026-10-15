import { createApiClient } from '@chinchi/sdk'

/** Same-origin API: Vite proxies `/api` in development, the reverse proxy does in production. */
export const createBrowserApi = () => createApiClient({ baseUrl: '/api/v1' })
