import { memberNicknameRequestSchema, memberSchema, snowflakeSchema } from '@chinchi/shared'
import { z } from 'zod'

import { requireAuth } from '../auth/auth.plugin'

import type { MemberNicknameService } from './member-nickname.service'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface MembersRoutesOptions {
  readonly memberNicknameService: MemberNicknameService
}

export const membersRoutes: FastifyPluginAsyncZod<MembersRoutesOptions> = async (
  app,
  { memberNicknameService },
) => {
  app.patch(
    '/guilds/:guildId/members/:userId',
    {
      schema: {
        params: z.object({ guildId: snowflakeSchema, userId: snowflakeSchema }),
        body: memberNicknameRequestSchema,
        response: {
          200: z.object({ success: z.literal(true), data: z.object({ member: memberSchema }) }),
        },
      },
    },
    async (request) => {
      const { guildId, userId } = request.params
      const member = await memberNicknameService.set(
        requireAuth(request).user.id,
        guildId,
        userId,
        request.body.nickname,
      )
      return { success: true as const, data: { member } }
    },
  )
}
