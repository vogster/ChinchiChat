import { describe, expect, it } from 'vitest'

import { ConfigError, loadConfig } from './env'

const DATABASE_URL = 'postgres://chinchi:chinchi@localhost:5432/chinchi'
const REDIS_URL = 'redis://localhost:6379'
const REQUIRED = { DATABASE_URL, REDIS_URL }

describe('loadConfig', () => {
  it('applies defaults when only required variables are set', () => {
    expect(loadConfig(REQUIRED)).toEqual({
      env: 'development',
      host: '0.0.0.0',
      port: 3000,
      logLevel: 'info',
      workerId: 0,
      databaseUrl: DATABASE_URL,
      databasePoolMax: 20,
      redisUrl: REDIS_URL,
      rateLimitEnabled: true,
      webOrigins: ['http://localhost:5173'],
      sessionTtlDays: 30,
      publicUrl: 'http://localhost:5173',
      smtpUrl: undefined,
      mailFrom: 'Chinchi <no-reply@localhost>',
      instanceName: 'Chinchi',
      registrationMode: 'open',
      trustProxy: false,
      gatewayHeartbeatMs: 41_250,
      linkPreviews: true,
      storage: undefined,
      voice: undefined,
      uploadMaxBytes: 25 * 1024 * 1024,
      metrics: undefined,
    })
  })

  it('serves metrics only when a port is given, on localhost by default', () => {
    expect(loadConfig({ ...REQUIRED, METRICS_PORT: '9464' }).metrics).toEqual({
      host: '127.0.0.1',
      port: 9464,
    })
    expect(
      loadConfig({ ...REQUIRED, METRICS_PORT: '9464', METRICS_HOST: '0.0.0.0' }).metrics,
    ).toEqual({ host: '0.0.0.0', port: 9464 })
    expect(() => loadConfig({ ...REQUIRED, METRICS_PORT: 'nope' })).toThrow(/METRICS_PORT/)
  })

  describe('object storage', () => {
    const S3 = {
      S3_ENDPOINT: 'http://rustfs:9000/',
      S3_ACCESS_KEY: 'key',
      S3_SECRET_KEY: 'secret',
    }

    it('is configured by an endpoint and keys, with defaults for the rest', () => {
      expect(loadConfig({ ...REQUIRED, ...S3 }).storage).toEqual({
        endpoint: 'http://rustfs:9000',
        publicUrl: 'http://rustfs:9000',
        region: 'us-east-1',
        bucket: 'chinchi',
        accessKey: 'key',
        secretKey: 'secret',
        forcePathStyle: true,
        encryption: false,
      })
    })

    it('presigns with a separate public URL when browsers reach storage elsewhere', () => {
      const config = loadConfig({
        ...REQUIRED,
        ...S3,
        S3_PUBLIC_URL: 'https://files.example.com',
        S3_REGION: 'eu-central-1',
        S3_BUCKET: 'chat-files',
        S3_PATH_STYLE: 'off',
        S3_ENCRYPTION: 'on',
        UPLOAD_MAX_BYTES: '1048576',
      })
      expect(config.storage).toMatchObject({
        publicUrl: 'https://files.example.com',
        region: 'eu-central-1',
        bucket: 'chat-files',
        forcePathStyle: false,
        encryption: true,
      })
      expect(config.uploadMaxBytes).toBe(1_048_576)
    })

    it.each([
      [{ S3_ENDPOINT: 'http://rustfs:9000' }, 'S3_ACCESS_KEY'],
      [{ ...S3, S3_SECRET_KEY: undefined }, 'S3_SECRET_KEY'],
      [{ ...S3, S3_ENDPOINT: 'ftp://rustfs' }, 'S3_ENDPOINT'],
      [{ ...S3, S3_BUCKET: 'Bad_Bucket' }, 'S3_BUCKET'],
      [{ ...S3, S3_ENCRYPTION: 'yes' }, 'S3_ENCRYPTION'],
      [{ ...S3, UPLOAD_MAX_BYTES: '0' }, 'UPLOAD_MAX_BYTES'],
      [{ ...S3, UPLOAD_MAX_BYTES: String(2 * 1024 ** 3) }, 'UPLOAD_MAX_BYTES'],
    ])('rejects %j naming %s', (env, variable) => {
      expect(() => loadConfig({ ...REQUIRED, ...env })).toThrow(variable)
    })

    it('never echoes the secret key', () => {
      expect(() =>
        loadConfig({ ...REQUIRED, ...S3, S3_ACCESS_KEY: undefined, S3_SECRET_KEY: 'hunter2' }),
      ).toThrow(expect.objectContaining({ message: expect.not.stringContaining('hunter2') }))
    })
  })

  it('treats empty variables as unset (docker compose passes blanks through)', () => {
    const config = loadConfig({ ...REQUIRED, SMTP_URL: '', S3_ENDPOINT: '', LIVEKIT_URL: '' })
    expect(config.smtpUrl).toBeUndefined()
    expect(config.storage).toBeUndefined()
    expect(config.voice).toBeUndefined()
  })

  describe('voice (LiveKit)', () => {
    const LIVEKIT = {
      LIVEKIT_URL: 'wss://voice.example.com/',
      LIVEKIT_API_KEY: 'key',
      LIVEKIT_API_SECRET: 'a-livekit-secret-of-at-least-32-chars',
    }

    it('is off until LiveKit is configured', () => {
      expect(loadConfig(REQUIRED).voice).toBeUndefined()
    })

    it('derives the server-side API address from the browser one', () => {
      expect(loadConfig({ ...REQUIRED, ...LIVEKIT }).voice).toEqual({
        url: 'wss://voice.example.com',
        apiUrl: 'https://voice.example.com',
        apiKey: 'key',
        apiSecret: 'a-livekit-secret-of-at-least-32-chars',
      })
      const local = loadConfig({
        ...REQUIRED,
        ...LIVEKIT,
        LIVEKIT_URL: 'ws://localhost:7880',
        LIVEKIT_API_URL: 'http://livekit:7880/',
      })
      expect(local.voice).toMatchObject({
        url: 'ws://localhost:7880',
        apiUrl: 'http://livekit:7880',
      })
    })

    it.each([
      [{ LIVEKIT_URL: 'wss://voice.example.com' }, 'LIVEKIT_API_KEY'],
      [{ ...LIVEKIT, LIVEKIT_API_SECRET: 'short' }, 'LIVEKIT_API_SECRET'],
      [{ ...LIVEKIT, LIVEKIT_URL: 'https://voice.example.com' }, 'LIVEKIT_URL'],
    ])('rejects %j naming %s', (env, variable) => {
      expect(() => loadConfig({ ...REQUIRED, ...env })).toThrow(variable)
    })

    it('never echoes the secret', () => {
      expect(() => loadConfig({ ...REQUIRED, ...LIVEKIT, LIVEKIT_API_SECRET: 'hunter2' })).toThrow(
        expect.objectContaining({ message: expect.not.stringContaining('hunter2') }),
      )
    })
  })

  it.each([
    ['true', true],
    ['false', false],
    ['1', 1],
    ['2', 2],
    ['10.0.0.1', ['10.0.0.1']],
    ['127.0.0.1, 10.0.0.0/8', ['127.0.0.1', '10.0.0.0/8']],
  ])('parses TRUST_PROXY=%j', (value, expected) => {
    expect(loadConfig({ ...REQUIRED, TRUST_PROXY: value }).trustProxy).toEqual(expected)
  })

  it('parses mail settings and strips the trailing slash from PUBLIC_URL', () => {
    const config = loadConfig({
      ...REQUIRED,
      PUBLIC_URL: 'https://chat.example.com/',
      SMTP_URL: 'smtps://user:pass@mail.example.com:465',
      MAIL_FROM: 'Chat <chat@example.com>',
    })
    expect(config).toMatchObject({
      publicUrl: 'https://chat.example.com',
      smtpUrl: 'smtps://user:pass@mail.example.com:465',
      mailFrom: 'Chat <chat@example.com>',
    })
  })

  it.each(['DATABASE_URL', 'REDIS_URL'])('requires %s', (key) => {
    const env = { ...REQUIRED, [key]: undefined }
    expect(() => loadConfig(env)).toThrow(new RegExp(key))
  })

  it.each(['not a url', 'mysql://user:pass@localhost/db', 'http://localhost'])(
    'rejects non-postgres DATABASE_URL %j',
    (value) => {
      expect(() => loadConfig({ ...REQUIRED, DATABASE_URL: value })).toThrow(ConfigError)
    },
  )

  it('accepts the postgresql:// scheme', () => {
    const url = 'postgresql://chinchi:chinchi@db:5432/chinchi'
    expect(loadConfig({ ...REQUIRED, DATABASE_URL: url }).databaseUrl).toBe(url)
  })

  it.each(['redis://valkey:6379', 'rediss://user:pass@cache.example.com:6380/1'])(
    'accepts REDIS_URL %j',
    (url) => {
      expect(loadConfig({ ...REQUIRED, REDIS_URL: url }).redisUrl).toBe(url)
    },
  )

  it.each(['localhost:6379', 'http://localhost:6379'])('rejects REDIS_URL %j', (value) => {
    expect(() => loadConfig({ ...REQUIRED, REDIS_URL: value })).toThrow(/REDIS_URL/)
  })

  it('can disable rate limiting', () => {
    expect(loadConfig({ ...REQUIRED, RATE_LIMIT: 'off' }).rateLimitEnabled).toBe(false)
  })

  it('parses a comma-separated list of web origins', () => {
    const config = loadConfig({
      ...REQUIRED,
      WEB_ORIGINS: 'https://chat.example.com, https://app.example.com/',
    })
    expect(config.webOrigins).toEqual(['https://chat.example.com', 'https://app.example.com'])
  })

  it.each(['not a url', 'ftp://example.com', 'https://example.com/path', ' , '])(
    'rejects invalid WEB_ORIGINS entry %j',
    (value) => {
      expect(() => loadConfig({ ...REQUIRED, WEB_ORIGINS: value })).toThrow(/WEB_ORIGINS/)
    },
  )

  it('parses provided values', () => {
    const config = loadConfig({
      ...REQUIRED,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: '8080',
      LOG_LEVEL: 'warn',
      WORKER_ID: '12',
      SESSION_TTL_DAYS: '7',
    })

    expect(config).toMatchObject({
      env: 'production',
      host: '127.0.0.1',
      port: 8080,
      logLevel: 'warn',
      workerId: 12,
      sessionTtlDays: 7,
    })
  })

  it('returns a frozen object', () => {
    const config = loadConfig(REQUIRED)
    expect(Object.isFrozen(config)).toBe(true)
    expect(Object.isFrozen(config.webOrigins)).toBe(true)
  })

  it.each([
    ['PORT', '0'],
    ['PORT', '70000'],
    ['PORT', 'abc'],
    ['NODE_ENV', 'staging'],
    ['LOG_LEVEL', 'verbose'],
    ['WORKER_ID', '1024'],
    ['SESSION_TTL_DAYS', '0'],
    ['SESSION_TTL_DAYS', '400'],
    ['RATE_LIMIT', 'maybe'],
    ['PUBLIC_URL', 'chat.example.com'],
    ['SMTP_URL', 'http://mail.example.com'],
    ['REGISTRATION_MODE', 'invite-only'],
    ['INSTANCE_NAME', '   '],
    ['TRUST_PROXY', ' , '],
    ['TRUST_PROXY', '-1'],
  ])('rejects invalid %s=%j', (key, value) => {
    expect(() => loadConfig({ ...REQUIRED, [key]: value })).toThrow(ConfigError)
  })

  it('names every invalid variable without echoing its value', () => {
    const error = captureError(() =>
      loadConfig({
        PORT: 'secret-port',
        LOG_LEVEL: 'secret-level',
        DATABASE_URL: 'secret-url',
        REDIS_URL: 'secret-redis',
      }),
    )

    expect(error).toBeInstanceOf(ConfigError)
    for (const key of ['PORT', 'LOG_LEVEL', 'DATABASE_URL', 'REDIS_URL']) {
      expect(error.message).toContain(key)
    }
    expect(error.message).not.toContain('secret')
  })
})

const captureError = (fn: () => unknown): Error => {
  try {
    fn()
  } catch (error) {
    return error as Error
  }
  throw new Error('Expected function to throw')
}
