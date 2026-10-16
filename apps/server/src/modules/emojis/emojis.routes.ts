import {
  createEmojiQuerySchema,
  EMOJI_IMAGE_MAX_BYTES,
  guildEmojiSchema,
  PROFILE_IMAGE_TYPES,
  snowflakeSchema,
  updateEmojiRequestSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { addressBucket } from '../../http/address-bucket'
import { requireAuth } from '../auth/auth.plugin'

import type { EmojiService } from './emoji.service'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface EmojisRoutesOptions {
  readonly emojiService: EmojiService
}

const emojiResponse = z.object({
  success: z.literal(true),
  data: z.object({ emoji: guildEmojiSchema }),
})
const guildParams = z.object({ guildId: snowflakeSchema })
const emojiParams = z.object({ guildId: snowflakeSchema, emojiId: snowflakeSchema })

/** Each upload decodes a picture: plenty for people, little for scripts. */
const UPLOAD_RATE_LIMIT = Object.freeze({
  max: 10,
  timeWindow: 60_000,
  hook: 'preHandler' as const,
  keyGenerator: (request: { auth: { user: { id: string } } | null; ip: string }) =>
    request.auth ? `user:${request.auth.user.id}` : `ip:${addressBucket(request.ip)}`,
})

/** Server emoji: the image is the request body, its name a query parameter. */
export const emojisRoutes: FastifyPluginAsyncZod<EmojisRoutesOptions> = async (
  app,
  { emojiService },
) => {
  // Scoped to this plugin: other routes keep accepting JSON only.
  app.addContentTypeParser(
    [...PROFILE_IMAGE_TYPES],
    { parseAs: 'buffer', bodyLimit: EMOJI_IMAGE_MAX_BYTES },
    (_request, body, done) => done(null, body),
  )

  app.post(
    '/guilds/:guildId/emojis',
    {
      bodyLimit: EMOJI_IMAGE_MAX_BYTES,
      config: { rateLimit: UPLOAD_RATE_LIMIT },
      schema: {
        params: guildParams,
        querystring: createEmojiQuerySchema,
        response: { 201: emojiResponse },
      },
    },
    async (request, reply) => {
      const emoji = await emojiService.create(
        request.params.guildId,
        requireAuth(request).user.id,
        request.query.name,
        request.body as Buffer,
      )
      return reply.status(201).send({ success: true as const, data: { emoji } })
    },
  )

  app.patch(
    '/guilds/:guildId/emojis/:emojiId',
    {
      schema: {
        params: emojiParams,
        body: updateEmojiRequestSchema,
        response: { 200: emojiResponse },
      },
    },
    async (request) => {
      const { guildId, emojiId } = request.params
      const emoji = await emojiService.rename(
        guildId,
        requireAuth(request).user.id,
        emojiId,
        request.body.name,
      )
      return { success: true as const, data: { emoji } }
    },
  )

  app.delete(
    '/guilds/:guildId/emojis/:emojiId',
    { schema: { params: emojiParams } },
    async (request, reply) => {
      const { guildId, emojiId } = request.params
      await emojiService.delete(guildId, requireAuth(request).user.id, emojiId)
      return reply.status(204).send()
    },
  )

  // Public like avatars: anyone who sees `<:name:id>` in a message may see the picture.
  app.get(
    '/emojis/:file',
    { schema: { params: z.object({ file: z.string().regex(/^\d{1,20}\.webp$/) }) } },
    async (request, reply) => {
      const { url, maxAgeS } = await emojiService.resolve(
        request.params.file.replace(/\.webp$/, ''),
      )
      return reply.header('cache-control', `public, max-age=${maxAgeS}`).redirect(url, 302)
    },
  )
}
