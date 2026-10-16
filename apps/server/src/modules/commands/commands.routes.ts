import { ok } from '../../http/responses'
import { addressBucket } from '../../http/address-bucket'
import {
  commandSchema,
  interactionResponseRequestSchema,
  invokeCommandRequestSchema,
  messageSchema,
  putCommandsRequestSchema,
  snowflakeSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { forbidden } from '../../http/http-error'
import { requireAuth, requireHuman } from '../auth/auth.plugin'

import type { CommandService } from './command.service'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface CommandsRoutesOptions {
  readonly commandService: CommandService
}

const commandList = ok(z.object({ commands: z.array(commandSchema) }))

/** An interaction is answered once: a handful of tries per interaction is plenty. */
const CALLBACK_RATE_LIMIT = Object.freeze({
  max: 10,
  timeWindow: 60_000,
  hook: 'preHandler' as const,
  keyGenerator: (request: { params: unknown; ip: string }) => {
    const { interactionId } = request.params as { interactionId?: string }
    return interactionId ? `interaction:${interactionId}` : `ip:${addressBucket(request.ip)}`
  },
})

/** Each run makes a bot post: about as often as someone could type messages. */
const INVOKE_RATE_LIMIT = Object.freeze({
  max: 20,
  timeWindow: 60_000,
  hook: 'preHandler' as const,
  keyGenerator: (request: { auth: { user: { id: string } } | null; ip: string }) =>
    request.auth ? `invoke:${request.auth.user.id}` : `ip:${addressBucket(request.ip)}`,
})

export const commandsRoutes: FastifyPluginAsyncZod<CommandsRoutesOptions> = async (
  app,
  { commandService },
) => {
  app.put(
    '/bots/@me/commands',
    { schema: { body: putCommandsRequestSchema, response: { 200: commandList } } },
    async (request) => {
      const { user } = requireAuth(request)
      if (!user.isBot) throw forbidden('BOTS_ONLY', 'Only bots register commands')
      return {
        success: true as const,
        data: { commands: await commandService.replace(user, request.body) },
      }
    },
  )

  app.get(
    '/guilds/:guildId/commands',
    {
      schema: { params: z.object({ guildId: snowflakeSchema }), response: { 200: commandList } },
    },
    async (request) => ({
      success: true as const,
      data: {
        commands: await commandService.listForGuild(
          request.params.guildId,
          requireAuth(request).user.id,
        ),
      },
    }),
  )

  app.post(
    '/channels/:channelId/interactions',
    {
      schema: {
        params: z.object({ channelId: snowflakeSchema }),
        body: invokeCommandRequestSchema,
      },
      config: { rateLimit: INVOKE_RATE_LIMIT },
    },
    async (request, reply) => {
      const { user } = requireHuman(request)
      await commandService.invoke(user, request.params.channelId, request.body)
      return reply.status(204).send()
    },
  )

  // The token is the credential: the bot answers without its own session.
  app.post(
    '/interactions/:interactionId/:token/callback',
    {
      schema: {
        params: z.object({
          interactionId: snowflakeSchema,
          token: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/),
        }),
        body: interactionResponseRequestSchema,
        response: { 201: ok(z.object({ message: messageSchema })) },
      },
      config: { rateLimit: CALLBACK_RATE_LIMIT },
    },
    async (request, reply) => {
      const { interactionId, token } = request.params
      const message = await commandService.respond(interactionId, token, request.body.content)
      return reply.status(201).send({ success: true as const, data: { message } })
    },
  )
}
