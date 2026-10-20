import {
  pollSchema,
  pollVoteRequestSchema,
  pollVotersQuerySchema,
  publicUserSchema,
  snowflakeSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { requireAuth } from '../auth/auth.plugin'
import { SEND_RATE_LIMIT } from './messages.routes'

import type { PollService } from './poll.service'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface PollsRoutesOptions {
  readonly pollService: PollService
}

const params = z.object({ channelId: snowflakeSchema, messageId: snowflakeSchema })
const pollResponse = z.object({ success: z.literal(true), data: z.object({ poll: pollSchema }) })
const answerParams = params.extend({ answerId: z.coerce.number().int().min(1).max(32_767) })
const votersResponse = z.object({
  success: z.literal(true),
  data: z.object({ users: z.array(publicUserSchema) }),
})

/** Every vote is an event to the whole channel: about one a second per user is plenty. */
const VOTE_RATE_LIMIT = Object.freeze({ ...SEND_RATE_LIMIT, max: 15 })

export const pollsRoutes: FastifyPluginAsyncZod<PollsRoutesOptions> = async (
  app,
  { pollService },
) => {
  app.put(
    '/channels/:channelId/polls/:messageId/answers/@me',
    {
      schema: { params, body: pollVoteRequestSchema, response: { 200: pollResponse } },
      config: { rateLimit: VOTE_RATE_LIMIT },
    },
    async (request) => {
      const { channelId, messageId } = request.params
      return {
        success: true as const,
        data: {
          poll: await pollService.vote(
            channelId,
            messageId,
            requireAuth(request).user.id,
            request.body.answerIds,
          ),
        },
      }
    },
  )

  app.post(
    '/channels/:channelId/polls/:messageId/expire',
    { schema: { params, response: { 200: pollResponse } }, config: { rateLimit: VOTE_RATE_LIMIT } },
    async (request) => {
      const { channelId, messageId } = request.params
      return {
        success: true as const,
        data: { poll: await pollService.end(channelId, messageId, requireAuth(request).user.id) },
      }
    },
  )

  app.get(
    '/channels/:channelId/polls/:messageId/answers/:answerId/voters',
    {
      schema: {
        params: answerParams,
        querystring: pollVotersQuerySchema,
        response: { 200: votersResponse },
      },
    },
    async (request) => {
      const { channelId, messageId, answerId } = request.params
      const users = await pollService.voters(
        channelId,
        messageId,
        requireAuth(request).user.id,
        answerId,
        request.query,
      )
      return { success: true as const, data: { users } }
    },
  )
}
