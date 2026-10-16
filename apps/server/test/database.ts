import { fileURLToPath } from 'node:url'

import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { GenericContainer, Wait } from 'testcontainers'

import { runMigrations } from '../src/db/migrate'
import { createObjectStorage } from '../src/storage/object-storage'
import { TEST_STORAGE, TEST_WEB_ORIGIN } from './storage'

import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string
    redisUrl: string
    s3Endpoint: string
  }
}

export const POSTGRES_IMAGE = 'postgres:18-alpine'
export const VALKEY_IMAGE = 'valkey/valkey:9.0-alpine'
export const RUSTFS_IMAGE = 'rustfs/rustfs:1.0.1'
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../drizzle', import.meta.url))

/** Starts Postgres, Valkey and RustFS once for the whole integration run; applies migrations. */
export default async function setup(project: TestProject) {
  const [postgres, valkey, rustfs] = await Promise.all([
    new PostgreSqlContainer(POSTGRES_IMAGE).start(),
    new GenericContainer(VALKEY_IMAGE)
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
      .start(),
    new GenericContainer(RUSTFS_IMAGE)
      .withEnvironment({
        RUSTFS_ACCESS_KEY: TEST_STORAGE.accessKey,
        RUSTFS_SECRET_KEY: TEST_STORAGE.secretKey,
        // KMS as in the bundled deployment, for the encryption-at-rest tests.
        RUSTFS_KMS_ENABLE: 'true',
        RUSTFS_KMS_BACKEND: 'local',
        RUSTFS_KMS_KEY_DIR: '/data/.kms',
        RUSTFS_KMS_LOCAL_MASTER_KEY: 'chinchi-test-kms-master-key-0123456789',
      })
      .withExposedPorts(9000)
      .withWaitStrategy(Wait.forHttp('/health', 9000).forStatusCode(200))
      .start(),
  ])

  const s3Endpoint = `http://${rustfs.getHost()}:${rustfs.getMappedPort(9000)}`
  await createObjectStorage({
    ...TEST_STORAGE,
    endpoint: s3Endpoint,
    publicUrl: s3Endpoint,
  }).ensureBucket([TEST_WEB_ORIGIN])

  const databaseUrl = postgres.getConnectionUri()
  await runMigrations(databaseUrl, MIGRATIONS_FOLDER)

  project.provide('databaseUrl', databaseUrl)
  project.provide('redisUrl', `redis://${valkey.getHost()}:${valkey.getMappedPort(6379)}`)
  project.provide('s3Endpoint', s3Endpoint)

  return async () => {
    await Promise.all([postgres.stop(), valkey.stop(), rustfs.stop()])
  }
}
