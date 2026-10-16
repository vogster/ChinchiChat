import { ok } from '../../http/responses'
import { addressBucket } from '../../http/address-bucket'
import {
  addBotRequestSchema,
  botSchema,
  createBotRequestSchema,
  snowflakeSchema,
  updateBotRequestSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { requireHuman } from '../auth/auth.plugin'

import type { BotService } from './bot.service'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface BotsRoutesOptions {
  readonly botService: BotService
}

const botParams = z.object({ botId: snowflakeSchema })

/** Each creation hashes a throwaway password and mints a token: a few a minute is plenty. */
const config = { rateLimit: { max: 10, timeWindow: 60_000 } }

/** Adding a public bot announces it to the server: a few a minute is plenty. */
const ADD_RATE_LIMIT = Object.freeze({
  max: 10,
  timeWindow: 60_000,
  hook: 'preHandler' as const,
  keyGenerator: (request: { auth: { user: { id: string } } | null; ip: string }) =>
    request.auth ? `add-bot:${request.auth.user.id}` : `ip:${addressBucket(request.ip)}`,
})

export const botsRoutes: FastifyPluginAsyncZod<BotsRoutesOptions> = async (app, { botService }) => {
  app.get(
    '/bots',
    { schema: { response: { 200: ok(z.object({ bots: z.array(botSchema) })) } } },
    async (request) => ({
      success: true as const,
      data: { bots: await botService.list(requireHuman(request).user.id) },
    }),
  )

  app.post(
    '/bots',
    {
      config,
      schema: {
        body: createBotRequestSchema,
        response: { 201: ok(z.object({ bot: botSchema, token: z.string() })) },
      },
    },
    async (request, reply) => {
      const created = await botService.create(requireHuman(request).user.id, request.body.username)
      return reply.status(201).send({ success: true as const, data: created })
    },
  )

  app.patch(
    '/bots/:botId',
    {
      schema: {
        params: botParams,
        body: updateBotRequestSchema,
        response: { 200: ok(z.object({ bot: botSchema })) },
      },
    },
    async (request) => ({
      success: true as const,
      data: {
        bot: await botService.update(
          requireHuman(request).user.id,
          request.params.botId,
          request.body,
        ),
      },
    }),
  )

  app.post(
    '/bots/:botId/token',
    {
      config,
      schema: { params: botParams, response: { 200: ok(z.object({ token: z.string() })) } },
    },
    async (request) => ({
      success: true as const,
      data: {
        token: await botService.renewToken(requireHuman(request).user.id, request.params.botId),
      },
    }),
  )

  app.delete('/bots/:botId', { schema: { params: botParams } }, async (request, reply) => {
    await botService.delete(requireHuman(request).user.id, request.params.botId)
    return reply.status(204).send()
  })

  app.post(
    '/guilds/:guildId/bots',
    {
      schema: { params: z.object({ guildId: snowflakeSchema }), body: addBotRequestSchema },
      config: { rateLimit: ADD_RATE_LIMIT },
    },
    async (request, reply) => {
      await botService.addToGuild(
        request.params.guildId,
        requireHuman(request).user.id,
        request.body.botId,
      )
      return reply.status(204).send()
    },
  )
}
