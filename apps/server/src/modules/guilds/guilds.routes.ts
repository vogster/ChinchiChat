import {
  createGuildRequestSchema,
  guildDetailSchema,
  guildSchema,
  memberSchema,
  snowflakeSchema,
  transferOwnershipRequestSchema,
  updateGuildRequestSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { requireAuth, requireVerifiedHuman } from '../auth/auth.plugin'
import { toGuild } from './guild.mapper'

import type { GuildService } from './guild.service'
import type { GuildDetail } from '@chinchi/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface GuildsRoutesOptions {
  readonly guildService: GuildService
}

const ok = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data })
const guildParams = z.object({ guildId: snowflakeSchema })
const guildResponse = ok(z.object({ guild: guildDetailSchema }))

const toDetail = (guild: GuildDetail) => ({ success: true as const, data: { guild } })

export const guildsRoutes: FastifyPluginAsyncZod<GuildsRoutesOptions> = async (
  app,
  { guildService },
) => {
  app.get(
    '/users/@me/guilds',
    { schema: { response: { 200: ok(z.object({ guilds: z.array(guildSchema) })) } } },
    async (request) => {
      const guilds = await guildService.listForUser(requireAuth(request).user.id)
      return { success: true as const, data: { guilds: guilds.map(toGuild) } }
    },
  )

  app.post(
    '/guilds',
    { schema: { body: createGuildRequestSchema, response: { 201: guildResponse } } },
    async (request, reply) => {
      const created = await guildService.create(
        (await requireVerifiedHuman(request)).user.id,
        request.body,
      )
      return reply.status(201).send(toDetail(created))
    },
  )

  app.get(
    '/guilds/:guildId',
    { schema: { params: guildParams, response: { 200: guildResponse } } },
    async (request) =>
      toDetail(await guildService.get(request.params.guildId, requireAuth(request).user.id)),
  )

  app.patch(
    '/guilds/:guildId',
    {
      schema: {
        params: guildParams,
        body: updateGuildRequestSchema,
        response: { 200: guildResponse },
      },
    },
    async (request) =>
      toDetail(
        await guildService.update(
          request.params.guildId,
          requireAuth(request).user.id,
          request.body,
        ),
      ),
  )

  app.post(
    '/guilds/:guildId/rules/accept',
    { schema: { params: guildParams, response: { 200: guildResponse } } },
    async (request) =>
      toDetail(
        await guildService.acceptRules(request.params.guildId, requireAuth(request).user.id),
      ),
  )

  app.delete('/guilds/:guildId', { schema: { params: guildParams } }, async (request, reply) => {
    await guildService.delete(request.params.guildId, requireAuth(request).user.id)
    return reply.status(204).send()
  })

  app.post(
    '/guilds/:guildId/transfer',
    {
      schema: {
        params: guildParams,
        body: transferOwnershipRequestSchema,
        response: { 200: guildResponse },
      },
    },
    async (request) =>
      toDetail(
        await guildService.transferOwnership(
          request.params.guildId,
          requireAuth(request).user.id,
          request.body.userId,
        ),
      ),
  )

  app.get(
    '/guilds/:guildId/members',
    {
      schema: {
        params: guildParams,
        response: { 200: ok(z.object({ members: z.array(memberSchema) })) },
      },
    },
    async (request) => {
      const members = await guildService.listMembers(
        request.params.guildId,
        requireAuth(request).user.id,
      )
      return { success: true as const, data: { members } }
    },
  )

  app.delete(
    '/guilds/:guildId/members/@me',
    { schema: { params: guildParams } },
    async (request, reply) => {
      await guildService.leave(request.params.guildId, requireAuth(request).user.id)
      return reply.status(204).send()
    },
  )
}
