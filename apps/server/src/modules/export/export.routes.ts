import { requireHuman } from '../auth/auth.plugin'

import type { DataExport } from './data-export'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface ExportRoutesOptions {
  readonly dataExport: DataExport
}

/** An export reads everything a user wrote: a few an hour is plenty. */
const EXPORT_RATE_LIMIT = Object.freeze({
  max: 3,
  timeWindow: 60 * 60_000,
  hook: 'preHandler' as const,
  keyGenerator: (request: { auth: { user: { id: string } } | null; ip: string }) =>
    request.auth ? `export:${request.auth.user.id}` : `export:${request.ip}`,
})

export const exportRoutes: FastifyPluginAsyncZod<ExportRoutesOptions> = async (
  app,
  { dataExport },
) => {
  app.get(
    '/users/@me/export',
    { config: { rateLimit: EXPORT_RATE_LIMIT } },
    async (request, reply) => {
      const { user } = requireHuman(request)
      const day = new Date().toISOString().slice(0, 10)
      return reply
        .header('content-type', 'application/zip')
        .header('content-disposition', `attachment; filename="chinchi-${user.username}-${day}.zip"`)
        .header('cache-control', 'no-store')
        .send(dataExport.build(user))
    },
  )
}
