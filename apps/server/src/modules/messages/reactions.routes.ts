import {
  base64Schema,
  publicUserSchema,
  reactionEmojiSchema,
  snowflakeSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { requireAuth } from '../auth/auth.plugin'
import { toPublicUser } from '../users/user.mapper'
import { SEND_RATE_LIMIT } from './messages.routes'

import type { ReactionService } from './reaction.service'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface ReactionsRoutesOptions {
  readonly reactionService: ReactionService
}

const base = '/channels/:channelId/messages/:messageId/reactions/:emoji'
const target = z.object({
  channelId: snowflakeSchema,
  messageId: snowflakeSchema,
  emoji: reactionEmojiSchema,
})
const otherTarget = target.extend({ userId: snowflakeSchema })

/** Every toggle is an event to the whole server: about one a second per user is plenty. */
const REACT_RATE_LIMIT = Object.freeze({ ...SEND_RATE_LIMIT, max: 15 })

export const reactionsRoutes: FastifyPluginAsyncZod<ReactionsRoutesOptions> = async (
  app,
  { reactionService },
) => {
  app.put(
    `${base}/@me`,
    { schema: { params: target }, config: { rateLimit: REACT_RATE_LIMIT } },
    async (request, reply) => {
      await reactionService.add(request.params, requireAuth(request).user.id)
      return reply.status(204).send()
    },
  )

  const encrypted = '/channels/:channelId/messages/:messageId/e2ee-reactions/@me'
  const message = z.object({ channelId: snowflakeSchema, messageId: snowflakeSchema })

  app.put(
    encrypted,
    {
      schema: { params: message, body: z.strictObject({ ciphertext: base64Schema(8 * 1024) }) },
      config: { rateLimit: REACT_RATE_LIMIT },
    },
    async (request, reply) => {
      const { channelId, messageId } = request.params
      await reactionService.setEncrypted(
        channelId,
        messageId,
        requireAuth(request).user.id,
        request.body.ciphertext,
      )
      return reply.status(204).send()
    },
  )

  app.delete(
    encrypted,
    { schema: { params: message }, config: { rateLimit: REACT_RATE_LIMIT } },
    async (request, reply) => {
      const { channelId, messageId } = request.params
      await reactionService.setEncrypted(channelId, messageId, requireAuth(request).user.id, null)
      return reply.status(204).send()
    },
  )

  app.delete(
    `${base}/@me`,
    { schema: { params: target }, config: { rateLimit: REACT_RATE_LIMIT } },
    async (request, reply) => {
      await reactionService.removeOwn(request.params, requireAuth(request).user.id)
      return reply.status(204).send()
    },
  )

  app.delete(
    `${base}/:userId`,
    { schema: { params: otherTarget }, config: { rateLimit: REACT_RATE_LIMIT } },
    async (request, reply) => {
      const { userId, ...reaction } = request.params
      await reactionService.removeOf(reaction, requireAuth(request).user.id, userId)
      return reply.status(204).send()
    },
  )

  app.get(
    base,
    {
      config: { rateLimit: SEND_RATE_LIMIT },
      schema: {
        params: target,
        response: {
          200: z.object({
            success: z.literal(true),
            data: z.object({ users: z.array(publicUserSchema) }),
          }),
        },
      },
    },
    async (request) => {
      const users = await reactionService.users(request.params, requireAuth(request).user.id)
      return { success: true as const, data: { users: users.map(toPublicUser) } }
    },
  )
}
