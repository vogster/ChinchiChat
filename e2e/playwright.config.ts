import { defineConfig, devices } from '@playwright/test'

const isCI = Boolean(process.env.CI)

// Ports differ from `pnpm dev` (3000/5173) so e2e can run next to a dev session.
const API_PORT = 3100
const WEB_PORT = 4173

/** Defaults match `pnpm dev:up`; CI overrides them to point at job services. */
export const e2eEnv = {
  databaseUrl: process.env.E2E_DATABASE_URL ?? 'postgres://chinchi:chinchi@localhost:5432/chinchi',
  redisUrl: process.env.E2E_REDIS_URL ?? 'redis://localhost:6379',
  smtpUrl: process.env.E2E_SMTP_URL ?? 'smtp://127.0.0.1:2525',
  mailpitUrl: process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025',
  s3Endpoint: process.env.E2E_S3_ENDPOINT ?? 'http://localhost:9000',
  livekitUrl: process.env.E2E_LIVEKIT_URL ?? 'ws://localhost:7880',
}

export default defineConfig({
  testDir: './tests',
  // Tests share one mailbox and database; unique names keep them independent.
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    // The UI language follows the browser; tests are written against the Russian copy.
    locale: 'ru-RU',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Voice tests need devices: Chromium's fake camera and microphone, no permission prompt.
        launchOptions: {
          args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
        },
      },
    },
  ],
  // Production builds of both apps, so e2e sees what users get.
  webServer: [
    {
      command: 'pnpm --filter @chinchi/server build && node ../apps/server/dist/server.mjs',
      url: `http://localhost:${API_PORT}/ready`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
      env: {
        NODE_ENV: 'production',
        PORT: String(API_PORT),
        LOG_LEVEL: 'warn',
        DATABASE_URL: e2eEnv.databaseUrl,
        REDIS_URL: e2eEnv.redisUrl,
        SMTP_URL: e2eEnv.smtpUrl,
        WEB_ORIGINS: `http://localhost:${WEB_PORT}`,
        PUBLIC_URL: `http://localhost:${WEB_PORT}`,
        RATE_LIMIT: 'off',
        // Its own bucket: the server sets the bucket's CORS to its web origin at start, and a
        // dev server on the same storage would set another one.
        S3_ENDPOINT: e2eEnv.s3Endpoint,
        S3_BUCKET: 'chinchi-e2e',
        S3_ACCESS_KEY: process.env.E2E_S3_ACCESS_KEY ?? 'chinchi-dev',
        S3_SECRET_KEY: process.env.E2E_S3_SECRET_KEY ?? 'chinchi-dev-secret',
        // As in production: every upload is encrypted at rest by the storage.
        S3_ENCRYPTION: 'on',
        // Never fetch the links tests send.
        LINK_PREVIEWS: 'off',
        // LiveKit from `pnpm dev:up`; its webhooks reach this server on :3100.
        LIVEKIT_URL: e2eEnv.livekitUrl,
        LIVEKIT_API_KEY: process.env.E2E_LIVEKIT_API_KEY ?? 'devkey',
        LIVEKIT_API_SECRET:
          process.env.E2E_LIVEKIT_API_SECRET ?? 'chinchi-dev-livekit-secret-0123456789',
      },
    },
    {
      command: `pnpm --filter @chinchi/web build && pnpm --filter @chinchi/web preview --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
      env: { CHINCHI_API_URL: `http://localhost:${API_PORT}` },
    },
  ],
})
