import { addressBucket } from '../../http/address-bucket'
import { channelSchema, createThreadRequestSchema, snowflakeSchema } from '@chinchi/shared'
import { z } from 'zod'

import { requireAuth } from '../auth/auth.plugin'

import type { ThreadService } from './thread.service'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface ThreadsRoutesOptions {
  readonly threadService: ThreadService
}

/** Threads are channels every member sees: a few a minute is plenty for people. */
const THREAD_RATE_LIMIT = Object.freeze({
  max: 10,
  timeWindow: 60_000,
  hook: 'preHandler' as const,
  keyGenerator: (request: { auth: { user: { id: string } } | null; ip: string }) =>
    request.auth ? `user:${request.auth.user.id}` : `ip:${addressBucket(request.ip)}`,
})

export const threadsRoutes: FastifyPluginAsyncZod<ThreadsRoutesOptions> = async (
  app,
  { threadService },
) => {
  app.post(
    '/channels/:channelId/threads',
    {
      schema: {
        params: z.object({ channelId: snowflakeSchema }),
        body: createThreadRequestSchema,
        response: {
          201: z.object({ success: z.literal(true), data: z.object({ channel: channelSchema }) }),
        },
      },
      config: { rateLimit: THREAD_RATE_LIMIT },
    },
    async (request, reply) => {
      const channel = await threadService.create(
        requireAuth(request).user.id,
        request.params.channelId,
        request.body,
      )
      return reply.status(201).send({ success: true as const, data: { channel } })
    },
  )
}
