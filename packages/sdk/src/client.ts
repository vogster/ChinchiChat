import { createAdminApi } from './admin'
import { createAnnouncementsApi } from './announcements'
import { createAuthApi } from './auth'
import { createBotsApi } from './bots'
import { createCommandsApi } from './commands'
import { createDownload } from './download'
import { createE2eeApi } from './e2ee'
import { createGuildsApi } from './guilds'
import { createHttp } from './http'
import { createMessagesApi } from './messages'
import { createSocialApi } from './social'
import { createFetchPut, createXhrPut } from './upload'

import type { HttpOptions } from './http'

export type { Download } from './download'
export type { ApiErrorDetail } from './errors'
export { ApiError, isApiError } from './errors'
export type { PutFile, UploadOptions, UploadProgress } from './upload'

/**
 * The REST client every Chinchi app uses: one object, grouped by domain (`api.guilds.get`,
 * `api.messages.create`, ...). Each group lives in its own module; responses are validated
 * against the shared schemas, errors arrive as `ApiError` with a stable `code`.
 */
export const createApiClient = (options: HttpOptions) => {
  const request = createHttp(options)
  // A browser (no fetch of its own) uploads files with progress; a native client's fetch
  // leaves through its own stack, so its uploads go there too, without progress.
  const putFile =
    !options.fetch && typeof XMLHttpRequest !== 'undefined'
      ? createXhrPut(XMLHttpRequest)
      : createFetchPut(options.fetch ?? globalThis.fetch)

  return {
    ...createAuthApi(request),
    ...createAdminApi(request),
    ...createGuildsApi(request),
    ...createMessagesApi(request, putFile),
    ...createE2eeApi(request),
    ...createSocialApi(request),
    ...createBotsApi(request),
    ...createCommandsApi(request),
    ...createAnnouncementsApi(request),
    /** Server files that need the session (attachments, previews), as bytes. */
    media: { download: createDownload(options) },
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
