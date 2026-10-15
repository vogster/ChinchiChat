import { z } from 'zod'

import { pingDatabase } from '../../db/ping'

import type { Database } from '../../db/client'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { Redis } from 'ioredis'

export interface HealthRoutesOptions {
  readonly db: Database
  readonly redis?: Redis | undefined
}

const healthResponse = z.object({
  success: z.literal(true),
  data: z.object({ status: z.literal('ok'), uptime: z.number() }),
})

const readyResponse = z.object({
  success: z.literal(true),
  data: z.object({ status: z.literal('ready') }),
})

const unavailableResponse = z.object({
  success: z.literal(false),
  code: z.string(),
  error: z.string(),
})

const pingRedis = async (redis: Redis): Promise<boolean> => {
  try {
    return (await redis.ping()) === 'PONG'
  } catch {
    return false
  }
}

/** `/health` is liveness (process is up), `/ready` is readiness (dependencies reachable). */
export const healthRoutes: FastifyPluginAsyncZod<HealthRoutesOptions> = async (
  app,
  { db, redis },
) => {
  // Probes run often and must never be throttled.
  const config = { rateLimit: false } as const

  app.get('/health', { config, schema: { response: { 200: healthResponse } } }, async () => ({
    success: true as const,
    data: { status: 'ok' as const, uptime: process.uptime() },
  }))

  app.get(
    '/ready',
    { config, schema: { response: { 200: readyResponse, 503: unavailableResponse } } },
    async (_request, reply) => {
      if (!(await pingDatabase(db))) {
        return reply.status(503).send({
          success: false as const,
          code: 'DATABASE_UNAVAILABLE',
          error: 'Database unavailable',
        })
      }
      if (redis && !(await pingRedis(redis))) {
        return reply.status(503).send({
          success: false as const,
          code: 'CACHE_UNAVAILABLE',
          error: 'Cache unavailable',
        })
      }
      return { success: true as const, data: { status: 'ready' as const } }
    },
  )
}
