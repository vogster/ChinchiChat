import { describe, expect, it } from 'vitest'

import { loadConfig } from './config/env'
import { loggerOptions, redactUrl } from './logger'

const DATABASE_URL = 'postgres://chinchi:chinchi@localhost:5432/chinchi'
const REDIS_URL = 'redis://localhost:6379'

describe('loggerOptions', () => {
  it('uses pretty output in development', () => {
    const options = loggerOptions(
      loadConfig({ NODE_ENV: 'development', LOG_LEVEL: 'debug', DATABASE_URL, REDIS_URL }),
    )

    expect(options).toMatchObject({ level: 'debug', transport: { target: 'pino-pretty' } })
  })

  it('emits redacted JSON logs in production', () => {
    const options = loggerOptions(loadConfig({ NODE_ENV: 'production', DATABASE_URL, REDIS_URL }))

    expect(options).not.toHaveProperty('transport')
    expect(options).toMatchObject({
      level: 'info',
      redact: expect.arrayContaining(['req.headers.authorization', 'req.headers.cookie']),
    })
  })
})

describe('redactUrl', () => {
  it('hides the secrets that webhook and interaction URLs carry', () => {
    expect(redactUrl('/api/v1/webhooks/12/SECRET')).toBe('/api/v1/webhooks/12/[redacted]')
    expect(redactUrl('/api/v1/interactions/34/SECRET/callback')).toBe(
      '/api/v1/interactions/34/[redacted]/callback',
    )
    expect(redactUrl('/api/v1/channels/5/messages')).toBe('/api/v1/channels/5/messages')
  })
})
