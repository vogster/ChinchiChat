import { sql } from 'drizzle-orm'
import { inject } from 'vitest'

import { buildApp } from '../src/app'
import { loadConfig } from '../src/config/env'
import { createDatabase } from '../src/db/client'
import { createMemoryEventBus } from '../src/events/event-bus'
import { createRedis } from '../src/redis/client'
import { createObjectStorage } from '../src/storage/object-storage'
import { testStorageConfig } from './storage'

import type { Database } from '../src/db/client'
import type { EventBus } from '../src/events/event-bus'
import type { Mailer } from '../src/mail/mailer'
import type { VoiceRooms } from '../src/modules/voice/livekit'
import type { Redis } from 'ioredis'

export const WEB_ORIGIN = 'http://localhost:5173'

/** App wired to the shared integration Postgres and Valkey containers. */
export interface TestAppOptions {
  readonly env?: Readonly<Record<string, string>>
  readonly mailer?: Mailer
  /** Use this bus instead of the in-memory one (e.g. a shared Redis stream bus). */
  readonly bus?: EventBus
  /** Wire the shared RustFS container (default) or run without object storage. */
  readonly storage?: boolean
  /** Link previews may fetch from localhost (a test site); production never does. */
  readonly linkPreviewsReachLocalhost?: boolean
  /** Stand-in for LiveKit's room API (with LIVEKIT_* in `env`). */
  readonly voiceRooms?: VoiceRooms
  /** Catches the first admin's confirmation link, which goes to the log without SMTP. */
  readonly reportFirstAdminLink?: (link: string) => void
}

export const createTestApp = ({
  env = {},
  mailer,
  bus,
  storage = true,
  linkPreviewsReachLocalhost = false,
  voiceRooms,
  reportFirstAdminLink,
}: TestAppOptions = {}) => {
  const database = createDatabase(inject('databaseUrl'))
  const cache = createRedis(inject('redisUrl'))
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: inject('databaseUrl'),
    REDIS_URL: inject('redisUrl'),
    WEB_ORIGINS: WEB_ORIGIN,
    // Tests never fetch the links they send unless a test asks for it.
    LINK_PREVIEWS: 'off',
    ...env,
  })
  const events = createMemoryEventBus()
  const app = buildApp(config, {
    db: database.db,
    redis: cache.redis,
    events: bus ?? events,
    ...(mailer ? { mailer } : {}),
    ...(storage ? { storage: createObjectStorage(testStorageConfig()) } : {}),
    ...(voiceRooms ? { voiceRooms } : {}),
    ...(reportFirstAdminLink ? { reportFirstAdminLink } : {}),
    ...(linkPreviewsReachLocalhost
      ? { linkFetchOverrides: { isAllowedAddress: () => true, isAllowedPort: () => true } }
      : {}),
  })

  return {
    app,
    db: database.db,
    redis: cache.redis,
    events,
    close: async () => {
      await app.close()
      await Promise.all([database.close(), cache.close()])
    },
  }
}

export const resetState = async (db: Database, redis: Redis): Promise<void> => {
  await Promise.all([
    db.execute(
      sql`truncate table relationships, channel_recipients, message_reactions, attachments, users, sessions, email_tokens, guilds, channels, guild_members, invites, messages, read_states, instance_settings restart identity cascade`,
    ),
    redis.flushdb(),
  ])
}
