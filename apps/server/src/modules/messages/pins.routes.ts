import { messageSchema, snowflakeSchema } from '@chinchi/shared'
import { z } from 'zod'

import { requireAuth } from '../auth/auth.plugin'
import { SEND_RATE_LIMIT } from './messages.routes'

import type { PinService } from './pin.service'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface PinsRoutesOptions {
  readonly pinService: PinService
}

const pinParams = z.object({ channelId: snowflakeSchema, messageId: snowflakeSchema })

export const pinsRoutes: FastifyPluginAsyncZod<PinsRoutesOptions> = async (app, { pinService }) => {
  app.get(
    '/channels/:channelId/pins',
    {
      schema: {
        params: z.object({ channelId: snowflakeSchema }),
        response: {
          200: z.object({
            success: z.literal(true),
            data: z.object({ messages: z.array(messageSchema) }),
          }),
        },
      },
    },
    async (request) => {
      const messages = await pinService.list(request.params.channelId, requireAuth(request).user.id)
      return { success: true as const, data: { messages } }
    },
  )

  app.put(
    '/channels/:channelId/pins/:messageId',
    { schema: { params: pinParams }, config: { rateLimit: SEND_RATE_LIMIT } },
    async (request, reply) => {
      const { channelId, messageId } = request.params
      await pinService.pin(channelId, messageId, requireAuth(request).user.id)
      return reply.status(204).send()
    },
  )

  app.delete(
    '/channels/:channelId/pins/:messageId',
    { schema: { params: pinParams }, config: { rateLimit: SEND_RATE_LIMIT } },
    async (request, reply) => {
      const { channelId, messageId } = request.params
      await pinService.unpin(channelId, messageId, requireAuth(request).user.id)
      return reply.status(204).send()
    },
  )
}
