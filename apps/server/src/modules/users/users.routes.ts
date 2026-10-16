import {
  currentUserSchema,
  deleteAccountRequestSchema,
  snowflakeSchema,
  updateProfileRequestSchema,
  userProfileSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { LOGIN_RATE_LIMIT } from '../../http/rate-limit'
import { requireAuth, requireHuman, SESSION_COOKIE } from '../auth/auth.plugin'
import { toCurrentUser } from './user.mapper'

import type { AccountDeletion } from './account-deletion.service'
import type { ProfileService } from './profile.service'
import type { ProfileEvents } from './profile-events'
import type { UserRepository } from './user.repository'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface UsersRoutesOptions {
  readonly users: UserRepository
  readonly profileEvents: ProfileEvents
  readonly profileService: ProfileService
  /** Who may talk to the user changed: calls in their DMs are re-checked. */
  readonly onDmPolicyChanged?: (userId: string) => Promise<void>
  readonly accountDeletion?: AccountDeletion
}

const meResponse = z.object({
  success: z.literal(true),
  data: z.object({ user: currentUserSchema }),
})

export const usersRoutes: FastifyPluginAsyncZod<UsersRoutesOptions> = async (
  app,
  { users, profileEvents, profileService, onDmPolicyChanged, accountDeletion },
) => {
  app.get('/users/@me', { schema: { response: { 200: meResponse } } }, async (request) => ({
    success: true as const,
    data: { user: toCurrentUser(requireAuth(request).user) },
  }))

  app.get(
    '/users/:userId/profile',
    {
      schema: {
        params: z.object({ userId: snowflakeSchema }),
        querystring: z.object({ guildId: snowflakeSchema.optional() }),
        response: {
          200: z.object({
            success: z.literal(true),
            data: z.object({ profile: userProfileSchema }),
          }),
        },
      },
    },
    async (request) => {
      const profile = await profileService.get(
        requireAuth(request).user,
        request.params.userId,
        request.query.guildId,
      )
      return { success: true as const, data: { profile } }
    },
  )

  app.delete(
    '/users/@me',
    { schema: { body: deleteAccountRequestSchema }, config: { rateLimit: LOGIN_RATE_LIMIT } },
    async (request, reply) => {
      if (!accountDeletion) return reply.status(404).send()
      await accountDeletion.deleteSelf(
        requireHuman(request).user,
        request.body.password,
        request.body.code,
      )
      return reply.clearCookie(SESSION_COOKIE, { path: '/' }).status(204).send()
    },
  )

  app.patch(
    '/users/@me',
    { schema: { body: updateProfileRequestSchema, response: { 200: meResponse } } },
    async (request) => {
      const { user } = requireAuth(request)
      const updated = await users.updateProfile(user.id, request.body)
      // Only the name is public; the DM setting is the user's own business.
      if (request.body.displayName !== undefined) await profileEvents.publish(updated)
      if (request.body.dmPolicy !== undefined) await onDmPolicyChanged?.(user.id)
      return { success: true as const, data: { user: toCurrentUser(updated) } }
    },
  )
}
