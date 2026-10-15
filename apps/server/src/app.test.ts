import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { buildApp } from './app'
import { loadConfig } from './config/env'
import { HttpError } from './http/http-error'

import type { Database } from './db/client'
import type { FastifyInstance } from 'fastify'
import type { Redis } from 'ioredis'

const baseEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgres://chinchi:chinchi@localhost:5432/chinchi',
  REDIS_URL: 'redis://localhost:6379',
}
const config = loadConfig(baseEnv)

const fakeDb = (execute: () => Promise<unknown>) => ({ execute }) as unknown as Database
const healthyDb = fakeDb(async () => [])

describe('buildApp', () => {
  let app: FastifyInstance | undefined

  afterEach(async () => {
    await app?.close()
    app = undefined
  })

  const createApp = (register?: (instance: FastifyInstance) => void, db = healthyDb) => {
    app = buildApp(config, { db })
    register?.(app)
    return app
  }

  it('GET /health reports ok', async () => {
    const response = await createApp().inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      success: true,
      data: { status: 'ok', uptime: expect.any(Number) },
    })
  })

  it('GET /ready reports ready when the database responds', async () => {
    const response = await createApp().inject({ method: 'GET', url: '/ready' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ success: true, data: { status: 'ready' } })
  })

  it('GET /ready returns 503 when the database is unreachable', async () => {
    const downDb = fakeDb(async () => {
      throw new Error('connect ECONNREFUSED')
    })
    const response = await createApp(undefined, downDb).inject({ method: 'GET', url: '/ready' })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual({
      success: false,
      code: 'DATABASE_UNAVAILABLE',
      error: 'Database unavailable',
    })
  })

  it('GET /ready returns 503 when the cache is unreachable', async () => {
    const downRedis = {
      ping: async () => {
        throw new Error('connect ECONNREFUSED')
      },
    } as unknown as Redis
    app = buildApp(loadConfig({ ...baseEnv, RATE_LIMIT: 'off' }), {
      db: healthyDb,
      redis: downRedis,
    })

    const response = await app.inject({ method: 'GET', url: '/ready' })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toMatchObject({ code: 'CACHE_UNAVAILABLE' })
  })

  it('returns a 404 envelope for unknown routes', async () => {
    const response = await createApp().inject({ method: 'GET', url: '/nope' })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({
      success: false,
      code: 'NOT_FOUND',
      error: 'Route GET /nope not found',
    })
  })

  it('returns 400 with details when zod validation fails', async () => {
    const response = await createApp((instance) => {
      instance.post(
        '/echo',
        { schema: { body: z.object({ name: z.string().min(2) }) } },
        async (request) => request.body,
      )
    }).inject({ method: 'POST', url: '/echo', payload: { name: 'x' } })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      success: false,
      code: 'VALIDATION_FAILED',
      error: 'Validation failed',
      details: [{ path: 'name', message: expect.any(String) }],
    })
  })

  it('returns HttpError status, code and message', async () => {
    const response = await createApp((instance) => {
      instance.get('/forbidden', async () => {
        throw new HttpError(403, 'MISSING_PERMISSION', 'Missing permission')
      })
    }).inject({ method: 'GET', url: '/forbidden' })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({
      success: false,
      code: 'MISSING_PERMISSION',
      error: 'Missing permission',
    })
  })

  it('maps other client errors to a generic code', async () => {
    const response = await createApp((instance) => {
      instance.get('/teapot', async () => {
        throw Object.assign(new Error('Short and stout'), { statusCode: 418 })
      })
    }).inject({ method: 'GET', url: '/teapot' })

    expect(response.statusCode).toBe(418)
    expect(response.json()).toEqual({
      success: false,
      code: 'BAD_REQUEST',
      error: 'Short and stout',
    })
  })

  it('accepts an empty body sent with a JSON content type', async () => {
    const response = await createApp((instance) => {
      instance.post('/ping', async (request) => ({ body: request.body ?? null }))
    }).inject({
      method: 'POST',
      url: '/ping',
      headers: { 'content-type': 'application/json' },
      payload: '',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ body: null })
  })

  it('rejects malformed JSON with the error envelope', async () => {
    const response = await createApp((instance) => {
      instance.post('/ping', async () => ({}))
    }).inject({
      method: 'POST',
      url: '/ping',
      headers: { 'content-type': 'application/json' },
      payload: '{nope',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ success: false, code: 'BAD_REQUEST' })
  })

  it('hides internal error details', async () => {
    const response = await createApp((instance) => {
      instance.get('/boom', async () => {
        throw new Error('db password is hunter2')
      })
    }).inject({ method: 'GET', url: '/boom' })

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({
      success: false,
      code: 'INTERNAL',
      error: 'Internal Server Error',
    })
  })
})
