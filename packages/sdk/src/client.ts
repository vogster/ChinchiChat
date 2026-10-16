import { createAdminApi } from './admin'
import { createAnnouncementsApi } from './announcements'
import { createAuthApi } from './auth'
import { createBotsApi } from './bots'
import { createCommandsApi } from './commands'
import { createE2eeApi } from './e2ee'
import { createGuildsApi } from './guilds'
import { createHttp } from './http'
import { createMessagesApi } from './messages'
import { createSocialApi } from './social'

import type { HttpOptions } from './http'

export type { ApiErrorDetail } from './errors'
export { ApiError, isApiError } from './errors'
export type { UploadOptions } from './upload'

/**
 * The REST client every Chinchi app uses: one object, grouped by domain (`api.guilds.get`,
 * `api.messages.create`, ...). Each group lives in its own module; responses are validated
 * against the shared schemas, errors arrive as `ApiError` with a stable `code`.
 */
export const createApiClient = (options: HttpOptions) => {
  const request = createHttp(options)
  const fetch = options.fetch ?? globalThis.fetch

  return {
    ...createAuthApi(request),
    ...createAdminApi(request),
    ...createGuildsApi(request),
    ...createMessagesApi(request, fetch),
    ...createE2eeApi(request),
    ...createSocialApi(request),
    ...createBotsApi(request),
    ...createCommandsApi(request),
    ...createAnnouncementsApi(request),
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
