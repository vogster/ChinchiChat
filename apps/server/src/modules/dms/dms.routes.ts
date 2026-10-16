import { ok } from '../../http/responses'
import { addressBucket } from '../../http/address-bucket'
import {
  createPrivateChannelRequestSchema,
  privateChannelSchema,
  snowflakeSchema,
  updatePrivateChannelRequestSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { requireHuman, requireVerifiedHuman } from '../auth/auth.plugin'

import type { DmService } from './dm.service'
import type { GroupDmService } from './group-dm.service'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface DmsRoutesOptions {
  readonly dmService: DmService
  readonly groupDmService: GroupDmService
}

const one = ok(z.object({ channel: privateChannelSchema }))
const recipient = z.object({ channelId: snowflakeSchema, userId: snowflakeSchema })

/** Opening a DM reaches another person: a few a minute per user. */
const OPEN_RATE_LIMIT = Object.freeze({
  max: 10,
  timeWindow: 60_000,
  hook: 'preHandler' as const,
  keyGenerator: (request: { auth: { user: { id: string } } | null; ip: string }) =>
    request.auth ? `user:${request.auth.user.id}` : `ip:${addressBucket(request.ip)}`,
})

/** Renames and removals reach every member: generous, but not an event firehose. */
const CHANGE_RATE_LIMIT = Object.freeze({ ...OPEN_RATE_LIMIT, max: 30 })

export const dmsRoutes: FastifyPluginAsyncZod<DmsRoutesOptions> = async (
  app,
  { dmService, groupDmService },
) => {
  app.get(
    '/users/@me/channels',
    { schema: { response: { 200: ok(z.object({ channels: z.array(privateChannelSchema) })) } } },
    async (request) => ({
      success: true as const,
      data: { channels: await dmService.list(requireHuman(request).user.id) },
    }),
  )

  app.post(
    '/users/@me/channels',
    {
      schema: {
        body: createPrivateChannelRequestSchema,
        response: { 200: one },
      },
      config: { rateLimit: OPEN_RATE_LIMIT },
    },
    async (request) => {
      const { user } = await requireVerifiedHuman(request)
      const { recipientIds, encrypted = false } = request.body
      const [only, ...more] = recipientIds
      const channel =
        only !== undefined && more.length === 0
          ? encrypted
            ? await dmService.openEncrypted(user, only)
            : await dmService.open(user, only)
          : await groupDmService.create(user, recipientIds, { encrypted })
      return { success: true as const, data: { channel } }
    },
  )

  app.patch(
    '/users/@me/channels/:channelId',
    {
      schema: {
        params: z.object({ channelId: snowflakeSchema }),
        body: updatePrivateChannelRequestSchema,
        response: { 200: one },
      },
      config: { rateLimit: CHANGE_RATE_LIMIT },
    },
    async (request) => {
      const channel = await groupDmService.rename(
        requireHuman(request).user,
        request.params.channelId,
        request.body.name,
      )
      return { success: true as const, data: { channel } }
    },
  )

  app.put(
    '/channels/:channelId/recipients/:userId',
    { schema: { params: recipient }, config: { rateLimit: OPEN_RATE_LIMIT } },
    async (request, reply) => {
      const { channelId, userId } = request.params
      await groupDmService.addRecipient(
        (await requireVerifiedHuman(request)).user,
        channelId,
        userId,
      )
      return reply.status(204).send()
    },
  )

  app.delete(
    '/channels/:channelId/recipients/:userId',
    { schema: { params: recipient }, config: { rateLimit: CHANGE_RATE_LIMIT } },
    async (request, reply) => {
      const { channelId, userId } = request.params
      await groupDmService.removeRecipient(requireHuman(request).user, channelId, userId)
      return reply.status(204).send()
    },
  )
}
