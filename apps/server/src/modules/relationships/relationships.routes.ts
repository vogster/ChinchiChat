import {
  friendRequestSchema,
  putRelationshipSchema,
  relationshipSchema,
  snowflakeSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { addressBucket } from '../../http/address-bucket'
import { ok } from '../../http/responses'
import { requireHuman, requireVerifiedHuman } from '../auth/auth.plugin'

import type { RelationshipService } from './relationship.service'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface RelationshipsRoutesOptions {
  readonly relationshipService: RelationshipService
}

const one = ok(z.object({ relationship: relationshipSchema }))
const target = z.object({ userId: snowflakeSchema })

/** Requests reach other people: a few a minute per user, not a spam channel. */
const REQUEST_RATE_LIMIT = Object.freeze({
  max: 10,
  timeWindow: 60_000,
  hook: 'preHandler' as const,
  keyGenerator: (request: { auth: { user: { id: string } } | null; ip: string }) =>
    request.auth ? `user:${request.auth.user.id}` : `ip:${addressBucket(request.ip)}`,
})

/** Removals notify the other person too; allow tidying a list, not spamming it. */
const REMOVE_RATE_LIMIT = Object.freeze({ ...REQUEST_RATE_LIMIT, max: 30 })

export const relationshipsRoutes: FastifyPluginAsyncZod<RelationshipsRoutesOptions> = async (
  app,
  { relationshipService },
) => {
  app.get(
    '/users/@me/relationships',
    { schema: { response: { 200: ok(z.object({ relationships: z.array(relationshipSchema) })) } } },
    async (request) => ({
      success: true as const,
      data: { relationships: await relationshipService.list(requireHuman(request).user.id) },
    }),
  )

  app.post(
    '/users/@me/relationships',
    {
      schema: { body: friendRequestSchema, response: { 200: one } },
      config: { rateLimit: REQUEST_RATE_LIMIT },
    },
    async (request) => {
      const relationship = await relationshipService.requestByUsername(
        (await requireVerifiedHuman(request)).user,
        request.body.username,
      )
      return { success: true as const, data: { relationship } }
    },
  )

  app.put(
    '/users/@me/relationships/:userId',
    {
      schema: { params: target, body: putRelationshipSchema, response: { 200: one } },
      config: { rateLimit: REQUEST_RATE_LIMIT },
    },
    async (request) => {
      // A friend request reaches someone, as by name: a confirmed email first (when the instance
      // asks for one). Blocking reaches nobody and stays open to everyone.
      const me =
        request.body.type === 'friend'
          ? (await requireVerifiedHuman(request)).user
          : requireHuman(request).user
      const relationship = await relationshipService.put(
        me,
        request.params.userId,
        request.body.type,
      )
      return { success: true as const, data: { relationship } }
    },
  )

  app.delete(
    '/users/@me/relationships/:userId',
    { schema: { params: target }, config: { rateLimit: REMOVE_RATE_LIMIT } },
    async (request, reply) => {
      await relationshipService.remove(requireHuman(request).user, request.params.userId)
      return reply.status(204).send()
    },
  )
}
