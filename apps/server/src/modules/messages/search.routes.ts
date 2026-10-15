import { addressBucket } from '../../http/address-bucket'
import { searchMessagesQuerySchema, searchResultSchema, snowflakeSchema } from '@chinchi/shared'
import { z } from 'zod'

import { requireAuth } from '../auth/auth.plugin'

import type { SearchService } from './search.service'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface SearchRoutesOptions {
  readonly searchService: SearchService
}

const response = z.object({ success: z.literal(true), data: searchResultSchema })

/** Search is the most expensive read: generous for people, tight for scripts. */
const SEARCH_RATE_LIMIT = Object.freeze({
  max: 30,
  timeWindow: 60_000,
  hook: 'preHandler' as const,
  keyGenerator: (request: { auth: { user: { id: string } } | null; ip: string }) =>
    request.auth ? `user:${request.auth.user.id}` : `ip:${addressBucket(request.ip)}`,
})
const config = { rateLimit: SEARCH_RATE_LIMIT }

export const searchRoutes: FastifyPluginAsyncZod<SearchRoutesOptions> = async (
  app,
  { searchService },
) => {
  app.get(
    '/guilds/:guildId/messages/search',
    {
      schema: {
        params: z.object({ guildId: snowflakeSchema }),
        querystring: searchMessagesQuerySchema,
        response: { 200: response },
      },
      config,
    },
    async (request) => ({
      success: true as const,
      data: await searchService.searchGuild(
        request.params.guildId,
        requireAuth(request).user.id,
        request.query,
      ),
    }),
  )

  app.get(
    '/channels/:channelId/messages/search',
    {
      schema: {
        params: z.object({ channelId: snowflakeSchema }),
        querystring: searchMessagesQuerySchema,
        response: { 200: response },
      },
      config,
    },
    async (request) => ({
      success: true as const,
      data: await searchService.searchChannel(
        request.params.channelId,
        requireAuth(request).user.id,
        request.query,
      ),
    }),
  )
}
