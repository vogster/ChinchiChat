import {
  createRoleRequestSchema,
  reorderRolesRequestSchema,
  roleSchema,
  snowflakeSchema,
  updateRoleRequestSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { requireAuth } from '../auth/auth.plugin'

import type { RoleService } from './role.service'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface RolesRoutesOptions {
  readonly roleService: RoleService
}

const ok = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data })
const roleResponse = ok(z.object({ role: roleSchema }))
const rolesResponse = ok(z.object({ roles: z.array(roleSchema) }))
const guildParams = z.object({ guildId: snowflakeSchema })
const roleParams = z.object({ guildId: snowflakeSchema, roleId: snowflakeSchema })
const memberRoleParams = z.object({
  guildId: snowflakeSchema,
  userId: snowflakeSchema,
  roleId: snowflakeSchema,
})

export const rolesRoutes: FastifyPluginAsyncZod<RolesRoutesOptions> = async (
  app,
  { roleService },
) => {
  app.get(
    '/guilds/:guildId/roles',
    { schema: { params: guildParams, response: { 200: rolesResponse } } },
    async (request) => ({
      success: true as const,
      data: { roles: await roleService.list(request.params.guildId, requireAuth(request).user.id) },
    }),
  )

  app.post(
    '/guilds/:guildId/roles',
    {
      schema: {
        params: guildParams,
        body: createRoleRequestSchema,
        response: { 201: roleResponse },
      },
    },
    async (request, reply) => {
      const role = await roleService.create(
        request.params.guildId,
        requireAuth(request).user.id,
        request.body,
      )
      return reply.status(201).send({ success: true as const, data: { role } })
    },
  )

  app.patch(
    '/guilds/:guildId/roles',
    {
      schema: {
        params: guildParams,
        body: reorderRolesRequestSchema,
        response: { 200: rolesResponse },
      },
    },
    async (request) => ({
      success: true as const,
      data: {
        roles: await roleService.reorder(
          request.params.guildId,
          requireAuth(request).user.id,
          request.body,
        ),
      },
    }),
  )

  app.patch(
    '/guilds/:guildId/roles/:roleId',
    {
      schema: {
        params: roleParams,
        body: updateRoleRequestSchema,
        response: { 200: roleResponse },
      },
    },
    async (request) => {
      const { guildId, roleId } = request.params
      const role = await roleService.update(
        guildId,
        roleId,
        requireAuth(request).user.id,
        request.body,
      )
      return { success: true as const, data: { role } }
    },
  )

  app.delete(
    '/guilds/:guildId/roles/:roleId',
    { schema: { params: roleParams } },
    async (request, reply) => {
      await roleService.delete(
        request.params.guildId,
        request.params.roleId,
        requireAuth(request).user.id,
      )
      return reply.status(204).send()
    },
  )

  app.put(
    '/guilds/:guildId/members/:userId/roles/:roleId',
    { schema: { params: memberRoleParams } },
    async (request, reply) => {
      const { guildId, userId, roleId } = request.params
      await roleService.addToMember(guildId, userId, roleId, requireAuth(request).user.id)
      return reply.status(204).send()
    },
  )

  app.delete(
    '/guilds/:guildId/members/:userId/roles/:roleId',
    { schema: { params: memberRoleParams } },
    async (request, reply) => {
      const { guildId, userId, roleId } = request.params
      await roleService.removeFromMember(guildId, userId, roleId, requireAuth(request).user.id)
      return reply.status(204).send()
    },
  )
}
