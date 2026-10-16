import { pollSchema, pollVoteRequestSchema, snowflakeSchema } from '@chinchi/shared'
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
}
