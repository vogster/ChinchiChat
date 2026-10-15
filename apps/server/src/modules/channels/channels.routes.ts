import {
  channelSchema,
  createChannelRequestSchema,
  putOverwriteRequestSchema,
  reorderChannelsRequestSchema,
  snowflakeSchema,
  updateChannelRequestSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { requireAuth } from '../auth/auth.plugin'

import type { ChannelService } from './channel.service'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface ChannelsRoutesOptions {
  readonly channelService: ChannelService
}

const ok = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data })
const channelResponse = ok(z.object({ channel: channelSchema }))
const channelParams = z.object({ channelId: snowflakeSchema })
const guildParams = z.object({ guildId: snowflakeSchema })

export const channelsRoutes: FastifyPluginAsyncZod<ChannelsRoutesOptions> = async (
  app,
  { channelService },
) => {
  app.post(
    '/guilds/:guildId/channels',
    {
      schema: {
        params: guildParams,
        body: createChannelRequestSchema,
        response: { 201: channelResponse },
      },
    },
    async (request, reply) => {
      const channel = await channelService.create(
        request.params.guildId,
        requireAuth(request).user.id,
        request.body,
      )
      return reply.status(201).send({ success: true as const, data: { channel } })
    },
  )

  app.patch(
    '/guilds/:guildId/channels',
    {
      schema: {
        params: guildParams,
        body: reorderChannelsRequestSchema,
        response: { 200: ok(z.object({ channels: z.array(channelSchema) })) },
      },
    },
    async (request) => {
      const channels = await channelService.reorder(
        request.params.guildId,
        requireAuth(request).user.id,
        request.body,
      )
      return { success: true as const, data: { channels } }
    },
  )

  app.get(
    '/channels/:channelId',
    { schema: { params: channelParams, response: { 200: channelResponse } } },
    async (request) => {
      const channel = await channelService.get(
        request.params.channelId,
        requireAuth(request).user.id,
      )
      return { success: true as const, data: { channel } }
    },
  )

  app.patch(
    '/channels/:channelId',
    {
      schema: {
        params: channelParams,
        body: updateChannelRequestSchema,
        response: { 200: channelResponse },
      },
    },
    async (request) => {
      const channel = await channelService.update(
        request.params.channelId,
        requireAuth(request).user.id,
        request.body,
      )
      return { success: true as const, data: { channel } }
    },
  )

  app.delete(
    '/channels/:channelId',
    { schema: { params: channelParams } },
    async (request, reply) => {
      await channelService.delete(request.params.channelId, requireAuth(request).user.id)
      return reply.status(204).send()
    },
  )

  const overwriteParams = z.object({ channelId: snowflakeSchema, targetId: snowflakeSchema })

  app.put(
    '/channels/:channelId/permissions/:targetId',
    {
      schema: {
        params: overwriteParams,
        body: putOverwriteRequestSchema,
        response: { 200: channelResponse },
      },
    },
    async (request) => {
      const channel = await channelService.putOverwrite(
        request.params.channelId,
        request.params.targetId,
        requireAuth(request).user.id,
        request.body,
      )
      return { success: true as const, data: { channel } }
    },
  )

  app.post(
    '/channels/:channelId/sync',
    { schema: { params: channelParams, response: { 200: channelResponse } } },
    async (request) => ({
      success: true as const,
      data: {
        channel: await channelService.syncWithCategory(
          request.params.channelId,
          requireAuth(request).user.id,
        ),
      },
    }),
  )

  app.delete(
    '/channels/:channelId/permissions/:targetId',
    { schema: { params: overwriteParams } },
    async (request, reply) => {
      await channelService.deleteOverwrite(
        request.params.channelId,
        request.params.targetId,
        requireAuth(request).user.id,
      )
      return reply.status(204).send()
    },
  )
}
