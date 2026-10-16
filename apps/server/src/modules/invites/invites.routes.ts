import { createInviteRequestSchema, inviteSchema, snowflakeSchema } from '@chinchi/shared'
import { z } from 'zod'

import { ok } from '../../http/responses'
import { requireAuth, requireVerifiedHuman } from '../auth/auth.plugin'
import { profileImageUrl } from '../media/media-paths'
import { toPublicUser } from '../users/user.mapper'

import type { GuildService } from '../guilds/guild.service'
import type { InviteService, InviteView } from './invite.service'
import type { Invite } from '@chinchi/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface InvitesRoutesOptions {
  readonly inviteService: InviteService
  readonly guildService: GuildService
}

const HOUR_MS = 60 * 60 * 1000
const inviteResponse = ok(z.object({ invite: inviteSchema }))
const codeParams = z.object({ code: z.string().regex(/^[A-Za-z0-9]{1,16}$/) })

export const toInvite = ({
  data: { invite, guild, channel, inviter },
  memberCount,
}: InviteView): Invite => ({
  code: invite.code,
  guild: {
    id: guild.id,
    name: guild.name,
    iconUrl: profileImageUrl('icons', guild.id, guild.iconId),
    memberCount,
  },
  channel: { id: channel.id, name: channel.name, type: channel.type },
  inviter: inviter ? toPublicUser(inviter) : null,
  uses: invite.uses,
  maxUses: invite.maxUses,
  expiresAt: invite.expiresAt?.toISOString() ?? null,
  createdAt: invite.createdAt.toISOString(),
})

export const invitesRoutes: FastifyPluginAsyncZod<InvitesRoutesOptions> = async (
  app,
  { inviteService, guildService },
) => {
  app.post(
    '/channels/:channelId/invites',
    {
      schema: {
        params: z.object({ channelId: snowflakeSchema }),
        body: createInviteRequestSchema,
        response: { 201: inviteResponse },
      },
      config: { rateLimit: { max: 30, timeWindow: HOUR_MS } },
    },
    async (request, reply) => {
      const invite = await inviteService.create(
        request.params.channelId,
        requireAuth(request).user.id,
        request.body,
      )
      return reply.status(201).send({ success: true as const, data: { invite: toInvite(invite) } })
    },
  )

  app.get(
    '/invites/:code',
    { schema: { params: codeParams, response: { 200: inviteResponse } } },
    async (request) => ({
      success: true as const,
      data: { invite: toInvite(await inviteService.preview(request.params.code)) },
    }),
  )

  app.post(
    '/invites/:code',
    {
      schema: { params: codeParams },
      config: { rateLimit: { max: 30, timeWindow: HOUR_MS } },
    },
    async (request) => {
      const { user } = await requireVerifiedHuman(request)
      const userId = user.id
      const guildId = await inviteService.accept(request.params.code, user)
      const guild = await guildService.get(guildId, userId)
      return {
        success: true as const,
        data: { guild },
      }
    },
  )

  app.get(
    '/guilds/:guildId/invites',
    {
      schema: {
        params: z.object({ guildId: snowflakeSchema }),
        response: { 200: ok(z.object({ invites: z.array(inviteSchema) })) },
      },
    },
    async (request) => {
      const list = await inviteService.listForGuild(
        request.params.guildId,
        requireAuth(request).user.id,
      )
      return { success: true as const, data: { invites: list.map(toInvite) } }
    },
  )

  app.delete('/invites/:code', { schema: { params: codeParams } }, async (request, reply) => {
    await inviteService.revoke(request.params.code, requireAuth(request).user.id)
    return reply.status(204).send()
  })
}
