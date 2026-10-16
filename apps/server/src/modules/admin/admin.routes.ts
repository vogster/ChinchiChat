import {
  adminGuildSchema,
  adminListQuerySchema,
  adminUserSchema,
  createInstanceInviteRequestSchema,
  instanceInviteSchema,
  instanceSettingsSchema,
  snowflakeSchema,
  updateAdminUserRequestSchema,
  updateInstanceSettingsRequestSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { ok } from '../../http/responses'
import { forbidden } from '../../http/http-error'
import { requireAuth } from '../auth/auth.plugin'

import type { AccountDeletion } from '../users/account-deletion.service'
import type { AuthContext } from '../auth/auth.service'
import type { AdminService } from './admin.service'
import type { FastifyRequest } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface AdminRoutesOptions {
  readonly adminService: AdminService
  readonly accountDeletion?: AccountDeletion
}

/** The signed-in user, if they run this instance. */
export const requireAdmin = (request: FastifyRequest): AuthContext => {
  const auth = requireAuth(request)
  if (!auth.user.isAdmin || auth.user.isBot)
    throw forbidden('NOT_ADMIN', 'Only instance admins can do this')
  return auth
}

export const adminRoutes: FastifyPluginAsyncZod<AdminRoutesOptions> = async (
  app,
  { adminService, accountDeletion },
) => {
  app.addHook('preHandler', async (request) => {
    requireAdmin(request)
  })

  const settingsResponse = ok(z.object({ settings: instanceSettingsSchema }))

  app.get('/admin/settings', { schema: { response: { 200: settingsResponse } } }, async () => ({
    success: true as const,
    data: { settings: await adminService.settings() },
  }))

  app.patch(
    '/admin/settings',
    {
      schema: { body: updateInstanceSettingsRequestSchema, response: { 200: settingsResponse } },
    },
    async (request) => ({
      success: true as const,
      data: { settings: await adminService.updateSettings(request.body) },
    }),
  )

  app.get(
    '/admin/users',
    {
      schema: {
        querystring: adminListQuerySchema,
        response: { 200: ok(z.object({ users: z.array(adminUserSchema) })) },
      },
    },
    async (request) => ({
      success: true as const,
      data: { users: await adminService.listUsers(request.query) },
    }),
  )

  app.patch(
    '/admin/users/:userId',
    {
      schema: {
        params: z.object({ userId: snowflakeSchema }),
        body: updateAdminUserRequestSchema,
        response: { 200: ok(z.object({ user: adminUserSchema })) },
      },
    },
    async (request) => ({
      success: true as const,
      data: {
        user: await adminService.updateUser(
          requireAdmin(request).user.id,
          request.params.userId,
          request.body,
        ),
      },
    }),
  )

  app.get(
    '/admin/guilds',
    {
      schema: {
        querystring: adminListQuerySchema,
        response: { 200: ok(z.object({ guilds: z.array(adminGuildSchema) })) },
      },
    },
    async (request) => ({
      success: true as const,
      data: { guilds: await adminService.listGuilds(request.query) },
    }),
  )

  app.delete(
    '/admin/users/:userId',
    { schema: { params: z.object({ userId: snowflakeSchema }) } },
    async (request, reply) => {
      if (!accountDeletion) return reply.status(404).send()
      await accountDeletion.deleteByAdmin(requireAdmin(request).user.id, request.params.userId)
      return reply.status(204).send()
    },
  )

  app.delete(
    '/admin/guilds/:guildId',
    { schema: { params: z.object({ guildId: snowflakeSchema }) } },
    async (request, reply) => {
      await adminService.deleteGuild(request.params.guildId)
      return reply.status(204).send()
    },
  )

  app.get(
    '/admin/invites',
    { schema: { response: { 200: ok(z.object({ invites: z.array(instanceInviteSchema) })) } } },
    async () => ({ success: true as const, data: { invites: await adminService.listInvites() } }),
  )

  app.post(
    '/admin/invites',
    {
      schema: {
        body: createInstanceInviteRequestSchema,
        response: { 200: ok(z.object({ invite: instanceInviteSchema })) },
      },
    },
    async (request) => ({
      success: true as const,
      data: {
        invite: await adminService.createInvite(requireAdmin(request).user.id, request.body),
      },
    }),
  )

  app.delete(
    '/admin/invites/:code',
    { schema: { params: z.object({ code: z.string().max(32) }) } },
    async (request, reply) => {
      await adminService.revokeInvite(request.params.code)
      return reply.status(204).send()
    },
  )
}
