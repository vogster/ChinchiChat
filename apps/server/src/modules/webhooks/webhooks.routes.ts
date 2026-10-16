import { ok } from '../../http/responses'
import { addressBucket } from '../../http/address-bucket'
import {
  createWebhookRequestSchema,
  executeWebhookRequestSchema,
  snowflakeSchema,
  webhookSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { requireAuth } from '../auth/auth.plugin'
import { hashSessionToken } from '../auth/session-token'

import type { WebhookService } from './webhook.service'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface WebhooksRoutesOptions {
  readonly webhookService: WebhookService
}

const channelParams = z.object({ channelId: snowflakeSchema })

/**
 * Per webhook and token: a noisy integration can't flood its channel, and someone sending
 * wrong tokens to a known webhook id fills their own bucket, not the integration's.
 */
const EXECUTE_RATE_LIMIT = Object.freeze({
  max: 30,
  timeWindow: 60_000,
  hook: 'preHandler' as const,
  keyGenerator: (request: { params: unknown; ip: string }) => {
    const { webhookId, token } = request.params as { webhookId?: string; token?: string }
    if (!webhookId || !token) return `ip:${addressBucket(request.ip)}`
    return `webhook:${webhookId}:${hashSessionToken(token).slice(0, 16)}`
  },
})

export const webhooksRoutes: FastifyPluginAsyncZod<WebhooksRoutesOptions> = async (
  app,
  { webhookService },
) => {
  app.get(
    '/channels/:channelId/webhooks',
    {
      schema: {
        params: channelParams,
        response: { 200: ok(z.object({ webhooks: z.array(webhookSchema) })) },
      },
    },
    async (request) => ({
      success: true as const,
      data: {
        webhooks: await webhookService.list(request.params.channelId, requireAuth(request).user.id),
      },
    }),
  )

  app.post(
    '/channels/:channelId/webhooks',
    {
      schema: {
        params: channelParams,
        body: createWebhookRequestSchema,
        response: { 201: ok(z.object({ webhook: webhookSchema, url: z.string() })) },
      },
    },
    async (request, reply) => {
      const created = await webhookService.create(
        request.params.channelId,
        requireAuth(request).user.id,
        request.body.name,
      )
      return reply.status(201).send({ success: true as const, data: created })
    },
  )

  app.delete(
    '/webhooks/:webhookId',
    { schema: { params: z.object({ webhookId: snowflakeSchema }) } },
    async (request, reply) => {
      await webhookService.delete(request.params.webhookId, requireAuth(request).user.id)
      return reply.status(204).send()
    },
  )

  // The URL is the credential: no session, called by other servers.
  app.post(
    '/webhooks/:webhookId/:token',
    {
      schema: {
        params: z.object({
          webhookId: snowflakeSchema,
          token: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/),
        }),
        body: executeWebhookRequestSchema,
      },
      config: { rateLimit: EXECUTE_RATE_LIMIT },
    },
    async (request, reply) => {
      const { webhookId, token } = request.params
      await webhookService.execute(webhookId, token, request.body)
      return reply.status(204).send()
    },
  )
}
