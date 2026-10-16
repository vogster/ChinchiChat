import { MAX_WORKER_ID, registrationModeSchema } from '@chinchi/shared'
import { z } from 'zod'

import type { RegistrationMode } from '@chinchi/shared'

const DEFAULT_WEB_ORIGIN = 'http://localhost:5173'

const toOrigin = (value: string): string | null => {
  try {
    const url = new URL(value)
    const isHttp = url.protocol === 'http:' || url.protocol === 'https:'
    const isBare = url.pathname === '/' && !url.search && !url.hash
    return isHttp && isBare ? url.origin : null
  } catch {
    return null
  }
}

/** Comma-separated list of browser origins allowed to call the API with cookies. */
const webOriginsSchema = z
  .string()
  .default(DEFAULT_WEB_ORIGIN)
  .transform((value, ctx) => {
    const entries = value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
    const origins = entries.map(toOrigin)

    if (origins.length === 0 || origins.some((origin) => origin === null)) {
      ctx.addIssue({ code: 'custom', message: 'Expected comma-separated http(s) origins' })
      return z.NEVER
    }
    return origins as string[]
  })

/** Public base URL of the web app, used in emailed links. Stored without a trailing slash. */
const publicUrlSchema = z
  .url({ protocol: /^https?$/ })
  .default(DEFAULT_WEB_ORIGIN)
  .transform((value) => value.replace(/\/+$/, ''))

/**
 * Which reverse proxies may set X-Forwarded-For: `false` (default, direct exposure), `true`
 * (any — only if the server is unreachable except through the proxy), a hop count, or a
 * comma-separated list of proxy IPs/CIDRs.
 */
const trustProxySchema = z
  .string()
  .default('false')
  .transform((value, ctx): boolean | number | string[] => {
    const trimmed = value.trim()
    if (trimmed === 'true') return true
    if (trimmed === 'false') return false
    if (/^\d+$/.test(trimmed)) return Number(trimmed)

    const entries = trimmed
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
    if (entries.length === 0 || entries.some((entry) => !/^[0-9a-fA-F.:/]+$/.test(entry))) {
      ctx.addIssue({ code: 'custom', message: 'Expected true, false, a hop count or IPs/CIDRs' })
      return z.NEVER
    }
    return entries
  })

const MIB = 1024 * 1024
const httpUrl = z.url({ protocol: /^https?$/ }).transform((value) => value.replace(/\/+$/, ''))
const wsUrl = z.url({ protocol: /^wss?$/ }).transform((value) => value.replace(/\/+$/, ''))

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  WORKER_ID: z.coerce.number().int().min(0).max(MAX_WORKER_ID).default(0),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  /** Postgres connections per server process; 10 made READY wait under load (see PLAN §4.9). */
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(200).default(20),
  RATE_LIMIT: z.enum(['on', 'off']).default('on'),
  WEB_ORIGINS: webOriginsSchema,
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  PUBLIC_URL: publicUrlSchema,
  /** Optional: without it emails are logged instead of sent. */
  SMTP_URL: z.url({ protocol: /^smtps?$/ }).optional(),
  MAIL_FROM: z.string().min(3).default('Chinchi <no-reply@localhost>'),
  INSTANCE_NAME: z.string().trim().min(1).max(64).default('Chinchi'),
  REGISTRATION_MODE: registrationModeSchema.default('open'),
  /**
   * The account that runs the instance: registering with this email makes it an admin
   * (and is allowed while there is no admin, whatever the registration mode). Without it,
   * the first account to register becomes the admin.
   */
  INITIAL_ADMIN_EMAIL: z.string().trim().toLowerCase().pipe(z.email()).optional(),
  TRUST_PROXY: trustProxySchema,
  /** Heartbeat interval announced in HELLO; tests use a short one. */
  GATEWAY_HEARTBEAT_MS: z.coerce.number().int().min(100).max(120_000).default(41_250),
  /** Server-side link previews (OpenGraph). `off` never fetches anything users link to. */
  LINK_PREVIEWS: z.enum(['on', 'off']).default('on'),
  /** Prometheus `/metrics` on a port of its own; off when unset. Never publish it. */
  METRICS_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
  /** Localhost by default; in Docker, 0.0.0.0 so Prometheus on the private network reaches it. */
  METRICS_HOST: z.string().min(1).default('127.0.0.1'),
  /** Optional S3-compatible storage; without it file uploads are disabled. */
  S3_ENDPOINT: httpUrl.optional(),
  /** Base URL browsers use to reach storage (presigned URLs); defaults to S3_ENDPOINT. */
  S3_PUBLIC_URL: httpUrl.optional(),
  S3_REGION: z.string().trim().min(1).default('us-east-1'),
  S3_BUCKET: z
    .string()
    .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/)
    .default('chinchi'),
  S3_ACCESS_KEY: z.string().min(1).optional(),
  S3_SECRET_KEY: z.string().min(1).optional(),
  /** `on` for RustFS/MinIO-style path URLs, `off` for virtual-hosted buckets. */
  S3_PATH_STYLE: z.enum(['on', 'off']).default('on'),
  /**
   * Encryption at rest: the bucket encrypts every object with a key from the storage's KMS
   * (RustFS: the server creates the default key on start). Off where the disk is trusted.
   */
  S3_ENCRYPTION: z.enum(['on', 'off']).default('off'),
  /** LiveKit as browsers reach it (ws:// or wss://); without it voice is off. */
  LIVEKIT_URL: wsUrl.optional(),
  /** LiveKit as the server reaches it; defaults to LIVEKIT_URL over http(s). */
  LIVEKIT_API_URL: httpUrl.optional(),
  LIVEKIT_API_KEY: z.string().trim().min(1).optional(),
  /** LiveKit itself refuses secrets shorter than 32 characters. */
  LIVEKIT_API_SECRET: z.string().min(32).optional(),
  /**
   * 32 bytes, hex: encrypts secrets the server must keep readable (TOTP) so a database copy
   * alone does not yield them. Optional for upgrades; the bundled deployment requires it.
   */
  SECRETS_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'Expected 64 hex characters (openssl rand -hex 32)')
    .optional(),
  /** Per-file limit; a single presigned PUT, so at most 1 GiB. */
  UPLOAD_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(1024 * MIB)
    .default(25 * MIB),
})

/** Keys are required as soon as storage is configured. */
const configSchema = envSchema.superRefine((env, ctx) => {
  if (env.S3_ENDPOINT) {
    for (const key of ['S3_ACCESS_KEY', 'S3_SECRET_KEY'] as const) {
      if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'Required with S3' })
    }
  }
  if (env.LIVEKIT_URL) {
    for (const key of ['LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'] as const) {
      if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'Required with LiveKit' })
    }
  }
})

export interface StorageConfig {
  readonly endpoint: string
  readonly publicUrl: string
  readonly region: string
  readonly bucket: string
  readonly accessKey: string
  readonly secretKey: string
  readonly forcePathStyle: boolean
  /** Objects are encrypted at rest by the storage (bucket default SSE-S3). */
  readonly encryption: boolean
}

export interface VoiceConfig {
  /** For browsers (ws/wss). */
  readonly url: string
  /** For the server's calls to LiveKit (http/https). */
  readonly apiUrl: string
  readonly apiKey: string
  readonly apiSecret: string
}

type ParsedEnv = z.output<typeof envSchema>

const toVoiceConfig = (env: ParsedEnv): VoiceConfig | undefined => {
  if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) return undefined
  return Object.freeze({
    url: env.LIVEKIT_URL,
    apiUrl: env.LIVEKIT_API_URL ?? env.LIVEKIT_URL.replace(/^ws/, 'http'),
    apiKey: env.LIVEKIT_API_KEY,
    apiSecret: env.LIVEKIT_API_SECRET,
  })
}

const toStorageConfig = (env: ParsedEnv): StorageConfig | undefined => {
  if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) return undefined
  return Object.freeze({
    endpoint: env.S3_ENDPOINT,
    publicUrl: env.S3_PUBLIC_URL ?? env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKey: env.S3_ACCESS_KEY,
    secretKey: env.S3_SECRET_KEY,
    forcePathStyle: env.S3_PATH_STYLE === 'on',
    encryption: env.S3_ENCRYPTION === 'on',
  })
}

export interface Config {
  readonly env: 'development' | 'test' | 'production'
  readonly host: string
  readonly port: number
  readonly logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'
  readonly workerId: number
  readonly databaseUrl: string
  readonly databasePoolMax: number
  readonly redisUrl: string
  readonly rateLimitEnabled: boolean
  readonly webOrigins: readonly string[]
  readonly sessionTtlDays: number
  readonly publicUrl: string
  readonly smtpUrl: string | undefined
  readonly mailFrom: string
  readonly instanceName: string
  readonly registrationMode: RegistrationMode
  readonly initialAdminEmail: string | undefined
  readonly trustProxy: boolean | number | readonly string[]
  readonly gatewayHeartbeatMs: number
  readonly linkPreviews: boolean
  readonly metrics: { readonly host: string; readonly port: number } | undefined
  readonly storage: StorageConfig | undefined
  readonly uploadMaxBytes: number
  readonly voice: VoiceConfig | undefined
  /** Key for secrets at rest (see SECRETS_KEY); undefined stores them as they are. */
  readonly secretsKey: Uint8Array | undefined
}

export class ConfigError extends Error {
  override readonly name = 'ConfigError'
}

/** Connection strings: a password with `/ @ # ?` in it is the usual reason they fail to parse. */
const CONNECTION_URLS = new Set(['DATABASE_URL', 'REDIS_URL', 'SMTP_URL'])

const describeIssue = (issue: z.core.$ZodIssue): string => {
  const variable = issue.path.join('.')
  if (CONNECTION_URLS.has(variable) && issue.code === 'invalid_format') {
    return (
      `${variable}: not a valid URL. Characters / @ # ? in the password must be ` +
      'percent-encoded, or generate the password with `openssl rand -hex 32`'
    )
  }
  return `${variable}: ${issue.code}`
}

/** Validates environment variables. Messages name the variable but never echo its value. */
export const loadConfig = (env: Readonly<Record<string, string | undefined>>): Config => {
  // `VAR=` in an env file (or docker compose's `${VAR:-}`) means "not set", not "set to nothing".
  const given = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''))
  const result = configSchema.safeParse(given)

  if (!result.success) {
    const problems = result.error.issues.map((issue) => `  - ${describeIssue(issue)}`)
    throw new ConfigError(`Invalid environment configuration:\n${problems.join('\n')}`)
  }

  const data = result.data
  return Object.freeze({
    env: data.NODE_ENV,
    host: data.HOST,
    port: data.PORT,
    logLevel: data.LOG_LEVEL,
    workerId: data.WORKER_ID,
    databaseUrl: data.DATABASE_URL,
    databasePoolMax: data.DATABASE_POOL_MAX,
    redisUrl: data.REDIS_URL,
    rateLimitEnabled: data.RATE_LIMIT === 'on',
    webOrigins: Object.freeze([...data.WEB_ORIGINS]),
    sessionTtlDays: data.SESSION_TTL_DAYS,
    publicUrl: data.PUBLIC_URL,
    smtpUrl: data.SMTP_URL,
    mailFrom: data.MAIL_FROM,
    instanceName: data.INSTANCE_NAME,
    registrationMode: data.REGISTRATION_MODE,
    initialAdminEmail: data.INITIAL_ADMIN_EMAIL,
    trustProxy: Array.isArray(data.TRUST_PROXY)
      ? Object.freeze([...data.TRUST_PROXY])
      : data.TRUST_PROXY,
    gatewayHeartbeatMs: data.GATEWAY_HEARTBEAT_MS,
    linkPreviews: data.LINK_PREVIEWS === 'on',
    metrics:
      data.METRICS_PORT !== undefined
        ? Object.freeze({ host: data.METRICS_HOST, port: data.METRICS_PORT })
        : undefined,
    storage: toStorageConfig(data),
    uploadMaxBytes: data.UPLOAD_MAX_BYTES,
    voice: toVoiceConfig(data),
    secretsKey: data.SECRETS_KEY ? Buffer.from(data.SECRETS_KEY, 'hex') : undefined,
  })
}
