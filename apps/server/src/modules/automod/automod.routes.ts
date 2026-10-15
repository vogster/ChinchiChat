import { automodSettingsSchema, snowflakeSchema, updateAutomodRequestSchema } from '@chinchi/shared'
import { z } from 'zod'

import { requireAuth } from '../auth/auth.plugin'

import type { AutomodService } from './automod.service'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface AutomodRoutesOptions {
  readonly automodService: AutomodService
}

const params = z.object({ guildId: snowflakeSchema })
const response = z.object({
  success: z.literal(true),
  data: z.object({ automod: automodSettingsSchema }),
})

export const automodRoutes: FastifyPluginAsyncZod<AutomodRoutesOptions> = async (
  app,
  { automodService },
) => {
  app.get(
    '/guilds/:guildId/automod',
    { schema: { params, response: { 200: response } } },
    async (request) => ({
      success: true as const,
      data: {
        automod: await automodService.settings(
          request.params.guildId,
          requireAuth(request).user.id,
        ),
      },
    }),
  )

  app.patch(
    '/guilds/:guildId/automod',
    { schema: { params, body: updateAutomodRequestSchema, response: { 200: response } } },
    async (request) => ({
      success: true as const,
      data: {
        automod: await automodService.update(
          request.params.guildId,
          requireAuth(request).user.id,
          request.body,
        ),
      },
    }),
  )
}
