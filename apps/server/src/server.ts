import { fileURLToPath } from 'node:url'

import closeWithGrace from 'close-with-grace'

import { buildApp } from './app'
import { ConfigError, loadConfig } from './config/env'
import { createDatabase } from './db/client'
import { runMigrations } from './db/migrate'
import { createSmtpMailer } from './mail/mailer'
import { startMetricsServer } from './metrics/metrics-server'
import { createRedisEventBus } from './events/redis-event-bus'
import { createRedis } from './redis/client'
import { createObjectStorage } from './storage/object-storage'

// `src/server.ts` and `dist/server.mjs` both sit one level below the package root.
const MIGRATIONS_FOLDER = fileURLToPath(new URL('../drizzle', import.meta.url))

const start = async (): Promise<void> => {
  const config = loadConfig(process.env)
  const database = createDatabase(config.databaseUrl, { max: config.databasePoolMax })
  const cache = createRedis(config.redisUrl)
  // Shared stream: realtime events reach clients on every server process, and can be replayed.
  const events = await createRedisEventBus(cache.redis)
  const storage = config.storage ? createObjectStorage(config.storage) : undefined
  const app = buildApp(config, {
    db: database.db,
    redis: cache.redis,
    events,
    ...(storage ? { storage } : {}),
    ...(config.smtpUrl ? { mailer: createSmtpMailer(config.smtpUrl, config.mailFrom) } : {}),
  })

  let metricsServer: Awaited<ReturnType<typeof startMetricsServer>> | undefined

  closeWithGrace({ delay: 10_000 }, async ({ err, signal }) => {
    if (err) {
      app.log.error({ err }, 'Shutting down after fatal error')
    } else {
      app.log.info({ signal }, 'Shutting down')
    }
    await metricsServer?.close()
    await app.close()
    await events.close()
    await Promise.all([database.close(), cache.close()])
  })

  await runMigrations(database.db, MIGRATIONS_FOLDER)
  app.log.info('Database migrations applied')

  if (storage) {
    await storage.ensureBucket(config.webOrigins)
    app.log.info('Object storage ready')
  } else {
    app.log.warn('S3_ENDPOINT is not set: file uploads are disabled')
  }

  await app.listen({ host: config.host, port: config.port })
  app.previews?.start()
  app.scheduler?.start()
  if (config.metrics) {
    metricsServer = await startMetricsServer(app.metrics.registry, config.metrics)
    app.log.info(config.metrics, 'Metrics served on /metrics')
  }
}

start().catch((error: unknown) => {
  const message = error instanceof ConfigError ? error.message : String(error)
  process.stderr.write(`Failed to start server: ${message}\n`)
  process.exit(1)
})
