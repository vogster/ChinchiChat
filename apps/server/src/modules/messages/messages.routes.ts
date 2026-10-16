import { ok } from '../../http/responses'
import { addressBucket } from '../../http/address-bucket'
import {
  createMessageRequestSchema,
  mentionCountsSchema,
  readStateSchema,
  listMessagesQuerySchema,
  messageSchema,
  snowflakeSchema,
  updateMessageRequestSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { requireAuth } from '../auth/auth.plugin'

import type { MentionCounter } from './mention-counter'
import type { MessageService } from './message.service'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface MessagesRoutesOptions {
  readonly messageService: MessageService
  readonly mentionCounter: MentionCounter
}

const messageResponse = ok(z.object({ message: messageSchema }))
const channelParams = z.object({ channelId: snowflakeSchema })
const messageParams = z.object({ channelId: snowflakeSchema, messageId: snowflakeSchema })

/** Per user (not per IP), checked after authentication so the user is known. */
export const SEND_RATE_LIMIT = Object.freeze({
  max: 10,
  timeWindow: 10_000,
  hook: 'preHandler' as const,
  keyGenerator: (request: { auth: { user: { id: string } } | null; ip: string }) =>
    request.auth ? `user:${request.auth.user.id}` : `ip:${addressBucket(request.ip)}`,
})

export const messagesRoutes: FastifyPluginAsyncZod<MessagesRoutesOptions> = async (
  app,
  { messageService, mentionCounter },
) => {
  app.get(
    '/channels/:channelId/messages',
    {
      schema: {
        params: channelParams,
        querystring: listMessagesQuerySchema,
        response: { 200: ok(z.object({ messages: z.array(messageSchema) })) },
      },
    },
    async (request) => {
      const messages = await messageService.list(
        request.params.channelId,
        requireAuth(request).user.id,
        request.query,
      )
      return { success: true as const, data: { messages } }
    },
  )

  app.post(
    '/channels/:channelId/messages',
    {
      schema: {
        params: channelParams,
        body: createMessageRequestSchema,
        response: { 201: messageResponse },
      },
      config: { rateLimit: SEND_RATE_LIMIT },
    },
    async (request, reply) => {
      const message = await messageService.create(
        request.params.channelId,
        requireAuth(request).user,
        request.body,
      )
      return reply.status(201).send({ success: true as const, data: { message } })
    },
  )

  app.patch(
    '/channels/:channelId/messages/:messageId',
    {
      schema: {
        params: messageParams,
        body: updateMessageRequestSchema,
        response: { 200: messageResponse },
      },
      config: { rateLimit: SEND_RATE_LIMIT },
    },
    async (request) => {
      const message = await messageService.update(
        request.params.channelId,
        request.params.messageId,
        requireAuth(request).user.id,
        request.body,
      )
      return { success: true as const, data: { message } }
    },
  )

  app.post(
    '/channels/:channelId/messages/:messageId/ack',
    { schema: { params: messageParams } },
    async (request, reply) => {
      await messageService.ack(
        request.params.channelId,
        request.params.messageId,
        requireAuth(request).user.id,
      )
      return reply.status(204).send()
    },
  )

  app.post(
    '/guilds/:guildId/ack',
    { schema: { params: z.object({ guildId: snowflakeSchema }) } },
    async (request, reply) => {
      await messageService.ackGuild(request.params.guildId, requireAuth(request).user.id)
      return reply.status(204).send()
    },
  )

  app.post(
    '/channels/:channelId/typing',
    { schema: { params: channelParams }, config: { rateLimit: SEND_RATE_LIMIT } },
    async (request, reply) => {
      await messageService.typing(request.params.channelId, requireAuth(request).user.id)
      return reply.status(204).send()
    },
  )

  app.get(
    '/users/@me/read-states',
    {
      schema: {
        response: {
          200: ok(
            z.object({ readStates: z.array(readStateSchema), mentionCounts: mentionCountsSchema }),
          ),
        },
      },
    },
    async (request) => {
      const userId = requireAuth(request).user.id
      const [readStates, mentionCounts] = await Promise.all([
        messageService.listReadStates(userId),
        mentionCounter.forUser(userId),
      ])
      return { success: true as const, data: { readStates, mentionCounts } }
    },
  )

  app.delete(
    '/channels/:channelId/messages/:messageId',
    { schema: { params: messageParams } },
    async (request, reply) => {
      await messageService.delete(
        request.params.channelId,
        request.params.messageId,
        requireAuth(request).user.id,
      )
      return reply.status(204).send()
    },
  )
}
