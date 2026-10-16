import { ok } from '../../http/responses'
import { addressBucket } from '../../http/address-bucket'
import {
  PROFILE_IMAGE_MAX_BYTES,
  PROFILE_IMAGE_TYPES,
  currentUserSchema,
  guildSchema,
  snowflakeSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { requireAuth } from '../auth/auth.plugin'
import { toGuild } from '../guilds/guild.mapper'
import { toCurrentUser } from '../users/user.mapper'

import type { MediaService } from './media.service'
import type { ProfileImageKind } from './media-paths'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface MediaRoutesOptions {
  readonly mediaService: MediaService
}

const userResponse = ok(z.object({ user: currentUserSchema }))
const guildResponse = ok(z.object({ guild: guildSchema }))
const guildParams = z.object({ guildId: snowflakeSchema })
const imageParams = z.object({
  ownerId: snowflakeSchema,
  file: z.string().regex(/^\d{1,20}\.webp$/),
})

/** Image processing is the expensive part: a few changes a minute per user is plenty. */
const IMAGE_RATE_LIMIT = Object.freeze({
  max: 5,
  timeWindow: 60_000,
  hook: 'preHandler' as const,
  keyGenerator: (request: { auth: { user: { id: string } } | null; ip: string }) =>
    request.auth ? `user:${request.auth.user.id}` : `ip:${addressBucket(request.ip)}`,
})

const upload = { bodyLimit: PROFILE_IMAGE_MAX_BYTES, config: { rateLimit: IMAGE_RATE_LIMIT } }

/** Avatars and server icons: the image itself is the request body. */
export const mediaRoutes: FastifyPluginAsyncZod<MediaRoutesOptions> = async (
  app,
  { mediaService },
) => {
  // Scoped to this plugin: other routes keep accepting JSON only.
  app.addContentTypeParser(
    [...PROFILE_IMAGE_TYPES],
    { parseAs: 'buffer', bodyLimit: PROFILE_IMAGE_MAX_BYTES },
    (_request, body, done) => done(null, body),
  )

  app.put(
    '/users/@me/avatar',
    { ...upload, schema: { response: { 200: userResponse } } },
    async (request) => {
      const { user } = requireAuth(request)
      const updated = await mediaService.setAvatar(user, request.body as Buffer)
      return { success: true as const, data: { user: toCurrentUser(updated) } }
    },
  )

  app.delete(
    '/users/@me/avatar',
    { schema: { response: { 200: userResponse } } },
    async (request) => {
      const updated = await mediaService.clearAvatar(requireAuth(request).user)
      return { success: true as const, data: { user: toCurrentUser(updated) } }
    },
  )

  app.put(
    '/users/@me/banner',
    { ...upload, schema: { response: { 200: userResponse } } },
    async (request) => {
      const user = requireAuth(request).user
      const updated = await mediaService.setBanner(user, request.body as Buffer)
      return { success: true as const, data: { user: toCurrentUser(updated) } }
    },
  )

  app.delete(
    '/users/@me/banner',
    { schema: { response: { 200: userResponse } } },
    async (request) => {
      const updated = await mediaService.clearBanner(requireAuth(request).user)
      return { success: true as const, data: { user: toCurrentUser(updated) } }
    },
  )

  app.put(
    '/guilds/:guildId/icon',
    { ...upload, schema: { params: guildParams, response: { 200: guildResponse } } },
    async (request) => {
      const guild = await mediaService.setGuildIcon(
        request.params.guildId,
        requireAuth(request).user.id,
        request.body as Buffer,
      )
      return { success: true as const, data: { guild: toGuild(guild) } }
    },
  )

  app.delete(
    '/guilds/:guildId/icon',
    { schema: { params: guildParams, response: { 200: guildResponse } } },
    async (request) => {
      const guild = await mediaService.clearGuildIcon(
        request.params.guildId,
        requireAuth(request).user.id,
      )
      return { success: true as const, data: { guild: toGuild(guild) } }
    },
  )

  // Public, like avatars on any chat service: the id in the path changes with every upload.
  for (const kind of ['avatars', 'icons', 'banners'] as const satisfies ProfileImageKind[]) {
    app.get(
      `/${kind}/:ownerId/:file`,
      { schema: { params: imageParams } },
      async (request, reply) => {
        const imageId = request.params.file.replace(/\.webp$/, '')
        const { url, maxAgeS } = await mediaService.resolve(kind, request.params.ownerId, imageId)
        return reply.header('cache-control', `public, max-age=${maxAgeS}`).redirect(url, 302)
      },
    )
  }
}
