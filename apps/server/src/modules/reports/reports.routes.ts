import {
  createReportRequestSchema,
  reportSchema,
  reportsQuerySchema,
  snowflakeSchema,
  updateReportRequestSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { addressBucket } from '../../http/address-bucket'
import { ok } from '../../http/responses'
import { requireAdmin } from '../admin/admin.routes'
import { requireAuth } from '../auth/auth.plugin'

import type { ReportService } from './report.service'
import type { FastifyRequest } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface ReportsRoutesOptions {
  readonly reportService: ReportService
}

const reportsResponse = ok(z.object({ reports: z.array(reportSchema) }))
const reportResponse = ok(z.object({ report: reportSchema }))

/** Reporting is cheap to send and costly to read: a few per minute is plenty. */
const REPORT_RATE_LIMIT = Object.freeze({
  max: 10,
  timeWindow: 60_000,
  hook: 'preHandler' as const,
  keyGenerator: (request: { auth: { user: { id: string } } | null; ip: string }) =>
    request.auth ? `user:${request.auth.user.id}` : `ip:${addressBucket(request.ip)}`,
})

export const reportsRoutes: FastifyPluginAsyncZod<ReportsRoutesOptions> = async (
  app,
  { reportService },
) => {
  app.post(
    '/channels/:channelId/messages/:messageId/report',
    {
      schema: {
        params: z.object({ channelId: snowflakeSchema, messageId: snowflakeSchema }),
        body: createReportRequestSchema,
      },
      config: { rateLimit: REPORT_RATE_LIMIT },
    },
    async (request, reply) => {
      const { channelId, messageId } = request.params
      await reportService.create(requireAuth(request).user.id, channelId, messageId, request.body)
      return reply.status(204).send()
    },
  )

  app.get(
    '/guilds/:guildId/reports',
    {
      schema: {
        params: z.object({ guildId: snowflakeSchema }),
        querystring: reportsQuerySchema,
        response: { 200: reportsResponse },
      },
    },
    async (request) => ({
      success: true as const,
      data: {
        reports: await reportService.listForGuild(
          request.params.guildId,
          requireAuth(request).user.id,
          request.query,
        ),
      },
    }),
  )

  app.patch(
    '/guilds/:guildId/reports/:reportId',
    {
      schema: {
        params: z.object({ guildId: snowflakeSchema, reportId: snowflakeSchema }),
        body: updateReportRequestSchema,
        response: { 200: reportResponse },
      },
    },
    async (request) => {
      const { guildId, reportId } = request.params
      const userId = requireAuth(request).user.id
      return {
        success: true as const,
        data: {
          report: await reportService.closeForGuild(guildId, userId, reportId, request.body.status),
        },
      }
    },
  )

  // Before validation, like the admin module's own routes.
  const adminOnly = async (request: FastifyRequest) => {
    requireAdmin(request)
  }

  app.get(
    '/admin/reports',
    {
      schema: { querystring: reportsQuerySchema, response: { 200: reportsResponse } },
      onRequest: adminOnly,
    },
    async (request) => {
      requireAdmin(request)
      return {
        success: true as const,
        data: { reports: await reportService.listDirect(request.query) },
      }
    },
  )

  app.patch(
    '/admin/reports/:reportId',
    {
      schema: {
        params: z.object({ reportId: snowflakeSchema }),
        body: updateReportRequestSchema,
        response: { 200: reportResponse },
      },
      onRequest: adminOnly,
    },
    async (request) => {
      const adminId = requireAdmin(request).user.id
      return {
        success: true as const,
        data: {
          report: await reportService.closeDirect(
            adminId,
            request.params.reportId,
            request.body.status,
          ),
        },
      }
    },
  )
}
