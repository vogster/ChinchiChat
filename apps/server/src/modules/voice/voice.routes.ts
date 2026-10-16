import {
  joinVoiceRequestSchema,
  memberVoiceRequestSchema,
  moveVoiceRequestSchema,
  snowflakeSchema,
  updateVoiceStateRequestSchema,
  voiceConnectionSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { addressBucket } from '../../http/address-bucket'
import { ok } from '../../http/responses'
import { requireAuth } from '../auth/auth.plugin'

import type { VoiceService } from './voice.service'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface VoiceRoutesOptions {
  readonly voiceService: VoiceService
}

/** Joining is cheap for the server but each join reaches LiveKit; a few per minute will do. */
const JOIN_RATE_LIMIT = Object.freeze({
  max: 20,
  timeWindow: 60_000,
  hook: 'preHandler' as const,
  keyGenerator: (request: { auth: { user: { id: string } } | null; ip: string }) =>
    request.auth ? `user:${request.auth.user.id}` : `ip:${addressBucket(request.ip)}`,
})

export const voiceRoutes: FastifyPluginAsyncZod<VoiceRoutesOptions> = async (
  app,
  { voiceService },
) => {
  app.post(
    '/channels/:channelId/voice',
    {
      schema: {
        params: z.object({ channelId: snowflakeSchema }),
        body: joinVoiceRequestSchema,
        response: { 200: ok(z.object({ connection: voiceConnectionSchema })) },
      },
      config: { rateLimit: JOIN_RATE_LIMIT },
    },
    async (request) => {
      const connection = await voiceService.join(
        requireAuth(request).user,
        request.params.channelId,
        request.body,
      )
      return { success: true as const, data: { connection } }
    },
  )

  app.patch(
    '/users/@me/voice-state',
    { schema: { body: updateVoiceStateRequestSchema }, config: { rateLimit: JOIN_RATE_LIMIT } },
    async (request, reply) => {
      await voiceService.updateSelf(requireAuth(request).user.id, request.body)
      return reply.status(204).send()
    },
  )

  app.patch(
    '/guilds/:guildId/members/:userId/voice',
    {
      schema: {
        params: z.object({ guildId: snowflakeSchema, userId: snowflakeSchema }),
        body: memberVoiceRequestSchema,
      },
      config: { rateLimit: JOIN_RATE_LIMIT },
    },
    async (request, reply) => {
      const { guildId, userId } = request.params
      await voiceService.moderate(requireAuth(request).user.id, guildId, userId, request.body)
      return reply.status(204).send()
    },
  )

  app.post(
    '/guilds/:guildId/members/:userId/voice/move',
    {
      schema: {
        params: z.object({ guildId: snowflakeSchema, userId: snowflakeSchema }),
        body: moveVoiceRequestSchema,
      },
      config: { rateLimit: JOIN_RATE_LIMIT },
    },
    async (request, reply) => {
      const { guildId, userId } = request.params
      const actorId = requireAuth(request).user.id
      await voiceService.move(actorId, guildId, userId, request.body.channelId)
      return reply.status(204).send()
    },
  )
}
