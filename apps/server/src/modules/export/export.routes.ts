import { exportDataRequestSchema, exportTicketSchema } from '@chinchi/shared'
import { z } from 'zod'

import { forbidden } from '../../http/http-error'
import { FAIL_CLOSED, perUserRateLimit } from '../../http/rate-limit'
import { ok } from '../../http/responses'
import { requireHuman } from '../auth/auth.plugin'

import type { UserRow } from '../users/user.repository'
import type { DataExport } from './data-export'
import type { ExportTickets } from './export-tickets'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface ExportRoutesOptions {
  readonly dataExport: DataExport
  readonly tickets: ExportTickets
  /** Everything a user wrote is behind the password and, with 2FA on, a code. */
  readonly confirmIdentity: (
    user: UserRow,
    password: string,
    code: string | undefined,
  ) => Promise<void>
}

const HOUR_MS = 60 * 60_000

/** An export reads everything a user wrote: a few an hour is plenty. */
const EXPORT_RATE_LIMIT = Object.freeze({
  max: 3,
  timeWindow: HOUR_MS,
  hook: 'preHandler' as const,
  keyGenerator: (request: { auth: { user: { id: string } } | null; ip: string }) =>
    request.auth ? `export:${request.auth.user.id}` : `export:${request.ip}`,
})

export const exportRoutes: FastifyPluginAsyncZod<ExportRoutesOptions> = async (
  app,
  { dataExport, tickets, confirmIdentity },
) => {
  app.post(
    '/users/@me/export',
    {
      schema: { body: exportDataRequestSchema, response: { 200: ok(exportTicketSchema) } },
      // Checks a password: fail closed.
      config: {
        rateLimit: { ...perUserRateLimit('export-ticket', 10, HOUR_MS), ...FAIL_CLOSED },
      },
    },
    async (request) => {
      const { user } = requireHuman(request)
      await confirmIdentity(user, request.body.password, request.body.code)
      return { success: true as const, data: { ticket: await tickets.create(user.id) } }
    },
  )

  app.get(
    '/users/@me/export/:ticket',
    {
      schema: { params: z.object({ ticket: z.string().max(128) }) },
      config: { rateLimit: EXPORT_RATE_LIMIT },
    },
    async (request, reply) => {
      const { user } = requireHuman(request)
      if ((await tickets.take(request.params.ticket)) !== user.id) {
        throw forbidden('INVALID_EXPORT_TICKET', 'Confirm with your password again')
      }
      const day = new Date().toISOString().slice(0, 10)
      return reply
        .header('content-type', 'application/zip')
        .header('content-disposition', `attachment; filename="chinchi-${user.username}-${day}.zip"`)
        .header('cache-control', 'no-store')
        .send(dataExport.build(user))
    },
  )
}
