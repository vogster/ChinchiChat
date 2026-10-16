import { ok } from '../../http/responses'
import { addressBucket } from '../../http/address-bucket'
import {
  auditLogEntrySchema,
  auditLogQuerySchema,
  banRequestSchema,
  banSchema,
  kickRequestSchema,
  snowflakeSchema,
  timeoutRequestSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { requireAuth } from '../auth/auth.plugin'

import type { AuditLogService } from './audit-log.service'
import type { ModerationService } from './moderation.service'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface ModerationRoutesOptions {
  readonly moderationService: ModerationService
  readonly auditLogService: AuditLogService
}

const guildParams = z.object({ guildId: snowflakeSchema })
const memberParams = z.object({ guildId: snowflakeSchema, userId: snowflakeSchema })

/** Moderators act in bursts (clearing a raid), but not endlessly. */
const MODERATION_RATE_LIMIT = Object.freeze({
  max: 60,
  timeWindow: 60_000,
  hook: 'preHandler' as const,
  keyGenerator: (request: { auth: { user: { id: string } } | null; ip: string }) =>
    request.auth ? `user:${request.auth.user.id}` : `ip:${addressBucket(request.ip)}`,
})
const config = { rateLimit: MODERATION_RATE_LIMIT }

export const moderationRoutes: FastifyPluginAsyncZod<ModerationRoutesOptions> = async (
  app,
  { moderationService, auditLogService },
) => {
  app.post(
    '/guilds/:guildId/members/:userId/kick',
    { schema: { params: memberParams, body: kickRequestSchema }, config },
    async (request, reply) => {
      const { guildId, userId } = request.params
      await moderationService.kick(
        requireAuth(request).user.id,
        guildId,
        userId,
        request.body.reason,
      )
      return reply.status(204).send()
    },
  )

  app.patch(
    '/guilds/:guildId/members/:userId/timeout',
    { schema: { params: memberParams, body: timeoutRequestSchema }, config },
    async (request, reply) => {
      const { guildId, userId } = request.params
      await moderationService.timeout(requireAuth(request).user.id, guildId, userId, request.body)
      return reply.status(204).send()
    },
  )

  app.get(
    '/guilds/:guildId/bans',
    {
      schema: {
        params: guildParams,
        response: { 200: ok(z.object({ bans: z.array(banSchema) })) },
      },
    },
    async (request) => ({
      success: true as const,
      data: {
        bans: await moderationService.listBans(
          requireAuth(request).user.id,
          request.params.guildId,
        ),
      },
    }),
  )

  app.put(
    '/guilds/:guildId/bans/:userId',
    { schema: { params: memberParams, body: banRequestSchema }, config },
    async (request, reply) => {
      const { guildId, userId } = request.params
      await moderationService.ban(requireAuth(request).user.id, guildId, userId, request.body)
      return reply.status(204).send()
    },
  )

  app.delete(
    '/guilds/:guildId/bans/:userId',
    { schema: { params: memberParams }, config },
    async (request, reply) => {
      const { guildId, userId } = request.params
      await moderationService.unban(requireAuth(request).user.id, guildId, userId)
      return reply.status(204).send()
    },
  )

  app.get(
    '/guilds/:guildId/audit-log',
    {
      schema: {
        params: guildParams,
        querystring: auditLogQuerySchema,
        response: { 200: ok(z.object({ entries: z.array(auditLogEntrySchema) })) },
      },
    },
    async (request) => ({
      success: true as const,
      data: {
        entries: await auditLogService.list(
          request.params.guildId,
          requireAuth(request).user.id,
          request.query,
        ),
      },
    }),
  )
}
