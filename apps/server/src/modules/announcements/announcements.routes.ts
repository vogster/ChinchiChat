import {
  followChannelRequestSchema,
  messageSchema,
  snowflakeSchema,
  webhookSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { addressBucket } from '../../http/address-bucket'
import { ok } from '../../http/responses'
import { requireAuth, requireHuman } from '../auth/auth.plugin'

import type { AnnouncementService } from './announcement.service'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface AnnouncementsRoutesOptions {
  readonly announcementService: AnnouncementService
}

/** Publishing copies a message into every follower: rarely needed in bulk. */
const PUBLISH_RATE_LIMIT = Object.freeze({
  max: 10,
  timeWindow: 60_000,
  hook: 'preHandler' as const,
  keyGenerator: (request: { auth: { user: { id: string } } | null; ip: string }) =>
    request.auth ? `publish:${request.auth.user.id}` : `ip:${addressBucket(request.ip)}`,
})

/** Following is set up once per channel: a few a minute is plenty. */
const FOLLOW_RATE_LIMIT = Object.freeze({
  ...PUBLISH_RATE_LIMIT,
  keyGenerator: (request: { auth: { user: { id: string } } | null; ip: string }) =>
    request.auth ? `follow:${request.auth.user.id}` : `ip:${addressBucket(request.ip)}`,
})

export const announcementsRoutes: FastifyPluginAsyncZod<AnnouncementsRoutesOptions> = async (
  app,
  { announcementService },
) => {
  app.post(
    '/channels/:channelId/followers',
    {
      schema: {
        params: z.object({ channelId: snowflakeSchema }),
        body: followChannelRequestSchema,
        response: { 201: ok(z.object({ webhook: webhookSchema })) },
      },
      config: { rateLimit: FOLLOW_RATE_LIMIT },
    },
    async (request, reply) => {
      const webhook = await announcementService.follow(
        request.params.channelId,
        requireHuman(request).user.id,
        request.body.channelId,
      )
      return reply.status(201).send({ success: true as const, data: { webhook } })
    },
  )

  app.post(
    '/channels/:channelId/messages/:messageId/publish',
    {
      schema: {
        params: z.object({ channelId: snowflakeSchema, messageId: snowflakeSchema }),
        response: { 200: ok(z.object({ message: messageSchema })) },
      },
      config: { rateLimit: PUBLISH_RATE_LIMIT },
    },
    async (request) => ({
      success: true as const,
      data: {
        message: await announcementService.publish(
          request.params.channelId,
          request.params.messageId,
          // Bots that post announcements publish them too.
          requireAuth(request).user.id,
        ),
      },
    }),
  )
}
