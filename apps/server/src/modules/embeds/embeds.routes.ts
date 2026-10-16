import { z } from 'zod'

import { badRequest, HttpError } from '../../http/http-error'
import { embedImageKey } from './link-unfurler'

import type { ObjectStorage } from '../../storage/object-storage'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface EmbedsRoutesOptions {
  readonly storage: ObjectStorage | undefined
}

/** An image id never changes its content, so the redirect may be cached for a long while. */
const URL_TTL_S = 24 * 60 * 60
const WINDOW_MS = 12 * 60 * 60 * 1000

/** Link preview images: public (they show public web pages), stored on this instance. */
export const embedsRoutes: FastifyPluginAsyncZod<EmbedsRoutesOptions> = async (
  app,
  { storage },
) => {
  app.get(
    '/embeds/:file',
    { schema: { params: z.object({ file: z.string().regex(/^[0-9a-f]{32}\.webp$/) }) } },
    async (request, reply) => {
      if (!storage) throw badRequest('UPLOADS_DISABLED', 'File uploads are disabled')
      const key = embedImageKey(request.params.file.replace(/\.webp$/, ''))
      if (!(await storage.stat(key))) throw new HttpError(404, 'UNKNOWN_IMAGE', 'Unknown image')
      const now = Date.now()
      const windowStart = now - (now % WINDOW_MS)
      const url = await storage.presignGet(key, {
        filename: request.params.file,
        contentType: 'image/webp',
        inline: true,
        expiresIn: URL_TTL_S,
        signedAt: new Date(windowStart),
      })
      const maxAge = Math.floor((windowStart + WINDOW_MS - now) / 1000)
      return reply.header('cache-control', `public, max-age=${maxAge}`).redirect(url, 302)
    },
  )
}
